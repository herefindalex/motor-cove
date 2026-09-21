import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const workspace = process.cwd();
const fixtureArg = process.argv.indexOf('--fixture');
const scanRoot = fixtureArg >= 0 ? path.resolve(process.argv[fixtureArg + 1]) : workspace;
const sourceRoots =
  fixtureArg >= 0 ? [scanRoot] : ['apps', 'packages'].map((p) => path.join(workspace, p));
const ignored = new Set(['node_modules', 'dist', 'out', 'coverage']);

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    const child = path.join(directory, entry.name);
    return entry.isDirectory()
      ? filesUnder(child)
      : /\.[cm]?[jt]sx?$/.test(entry.name)
        ? [child]
        : [];
  });
}

const files = sourceRoots.flatMap(filesUnder).map((file) => path.resolve(file));
const fileSet = new Set(files);
const packageRoots = new Map();
if (fixtureArg < 0) {
  for (const parent of ['apps', 'packages']) {
    const parentPath = path.join(workspace, parent);
    if (!fs.existsSync(parentPath)) continue;
    for (const name of fs.readdirSync(parentPath)) {
      const packageJson = path.join(parentPath, name, 'package.json');
      if (fs.existsSync(packageJson))
        packageRoots.set(
          JSON.parse(fs.readFileSync(packageJson, 'utf8')).name,
          path.dirname(packageJson),
        );
    }
  }
}

function resolveCandidate(candidate) {
  const candidates = [
    candidate,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    `${candidate}.mts`,
    path.join(candidate, 'index.ts'),
    path.join(candidate, 'index.tsx'),
  ];
  return candidates.find((item) => fileSet.has(path.resolve(item)));
}

function resolveImport(importer, specifier) {
  if (specifier.startsWith('.'))
    return resolveCandidate(path.resolve(path.dirname(importer), specifier.replace(/\.js$/, '')));
  for (const [packageName, root] of packageRoots) {
    if (specifier === packageName) return resolveCandidate(path.join(root, 'src/index'));
    if (specifier.startsWith(`${packageName}/`))
      return (
        resolveCandidate(
          path.join(root, 'src', specifier.slice(packageName.length + 1), 'index'),
        ) ?? resolveCandidate(path.join(root, 'src', specifier.slice(packageName.length + 1)))
      );
  }
  if (specifier.startsWith('@fixture/'))
    return resolveCandidate(path.join(scanRoot, specifier.slice('@fixture/'.length)));
  return undefined;
}

function importsOf(file) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports = [];
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      imports.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    )
      imports.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return imports;
}

const edges = new Map(files.map((file) => [file, []]));
const violations = [];
const displayRoot = fixtureArg >= 0 ? scanRoot : workspace;
const rel = (file) => path.relative(displayRoot, file).replaceAll(path.sep, '/');
for (const importer of files) {
  const importerRel = rel(importer);
  for (const specifier of importsOf(importer)) {
    const target = resolveImport(importer, specifier);
    if (target) edges.get(importer)?.push(path.resolve(target));
    const targetRel = target ? rel(target) : '';
    if (
      /^apps\/[^/]+\/src\//.test(importerRel) &&
      /^apps\/[^/]+\/src\//.test(targetRel) &&
      importerRel.split('/')[1] !== targetRel.split('/')[1]
    )
      violations.push(
        `${importerRel}: applications cannot import another application (${specifier})`,
      );
    if (importerRel.startsWith('packages/') && targetRel.startsWith('apps/'))
      violations.push(`${importerRel}: packages cannot import applications (${specifier})`);
    if (
      importerRel.startsWith('apps/web/') &&
      (specifier === '@motorcove/database' || specifier.startsWith('@motorcove/database/'))
    )
      violations.push(`${importerRel}: web cannot import server-only database packages`);
    if (
      importerRel.startsWith('apps/api/') &&
      specifier.startsWith('@motorcove/database/') &&
      !['@motorcove/database/reader', '@motorcove/database/environment'].includes(specifier)
    )
      violations.push(`${importerRel}: API can import only database reader and environment ports`);
    if (
      importerRel.startsWith('apps/indexer/') &&
      specifier === 'better-sqlite3' &&
      !importerRel.startsWith('apps/indexer/src/adapters/sqlite/')
    )
      violations.push(`${importerRel}: only the Indexer SQLite adapter can import the driver`);
    if (
      (importerRel.startsWith('apps/api/') || importerRel.startsWith('apps/web/')) &&
      specifier === 'better-sqlite3'
    )
      violations.push(`${importerRel}: API and Web cannot import the SQLite driver`);
    if (
      specifier.includes('drizzle-orm/better-sqlite3/migrator') &&
      !importerRel.startsWith('packages/database/src/maintenance/') &&
      importerRel !== 'tooling/db/check.ts' &&
      importerRel !== 'packages/database/src/maintenance/generate-contract.ts'
    )
      violations.push(`${importerRel}: a second migration runner is forbidden`);
    if (
      /\/(application|model|domain)\//.test(importerRel) &&
      ['viem', 'wagmi', 'fastify', 'better-sqlite3', 'react'].some(
        (sdk) => specifier === sdk || specifier.startsWith(`${sdk}/`),
      )
    )
      violations.push(
        `${importerRel}: pure/application layer imports infrastructure SDK ${specifier}`,
      );
    if (
      importerRel.startsWith('apps/web/src/capabilities/') &&
      targetRel.startsWith('apps/web/src/features/')
    )
      violations.push(`${importerRel}: capabilities cannot depend on features`);
    if (
      importerRel.startsWith('apps/web/src/capabilities/transactions/recovery') &&
      (specifier === 'wagmi' ||
        specifier.startsWith('wagmi/') ||
        targetRel.includes('/integrations/evm/use-escrow-gateway.'))
    )
      violations.push(`${importerRel}: transaction recovery cannot import wallet write capability`);
    const fromFeature = importerRel.match(/^apps\/web\/src\/features\/([^/]+)\//)?.[1];
    const toFeature = targetRel.match(/^apps\/web\/src\/features\/([^/]+)\//)?.[1];
    if (
      fromFeature &&
      toFeature &&
      fromFeature !== toFeature &&
      !/\/features\/[^/]+\/index\.tsx?$/.test(targetRel)
    )
      violations.push(
        `${importerRel}: cross-feature dependency must use the public index (${specifier})`,
      );
  }
}

const visiting = new Set();
const visited = new Set();
function detectCycle(node, stack) {
  if (visiting.has(node)) {
    const start = stack.indexOf(node);
    violations.push(
      `circular dependency: ${stack.slice(start).concat(node).map(rel).join(' -> ')}`,
    );
    return;
  }
  if (visited.has(node)) return;
  visiting.add(node);
  for (const target of edges.get(node) ?? []) detectCycle(target, [...stack, node]);
  visiting.delete(node);
  visited.add(node);
}
for (const file of files) detectCycle(file, []);

if (violations.length > 0) {
  console.error(violations.sort().join('\n'));
  process.exit(1);
}
console.log(`Architecture graph valid (${files.length} source files).`);
