import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';

const workspace = resolve(import.meta.dirname, '../..');
const parser = unified().use(remarkParse).use(remarkGfm);
const errors: string[] = [];
const fail = (message: string) => errors.push(message);
const walk = (path: string): string[] =>
  existsSync(path)
    ? readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
        const child = resolve(path, entry.name);
        return entry.isDirectory() ? walk(child) : [child];
      })
    : [];
const slug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
function markdownLinks(root: string, files: string[]) {
  const anchorCache = new Map<string, Set<string>>();
  const anchors = (file: string) => {
    const cached = anchorCache.get(file);
    if (cached) return cached;
    const set = new Set<string>();
    const counts = new Map<string, number>();
    const tree = parser.parse(readFileSync(file, 'utf8'));
    visit(tree, 'heading', (node) => {
      const base = slug(toString(node));
      const count = counts.get(base) ?? 0;
      counts.set(base, count + 1);
      set.add(count ? `${base}-${count}` : base);
    });
    anchorCache.set(file, set);
    return set;
  };
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    let tree;
    try {
      tree = parser.parse(source);
    } catch (error) {
      fail(`${file}: markdown parse failed ${String(error)}`);
      continue;
    }
    visit(tree, 'link', (node) => {
      const url = node.url;
      if (/^(https?:|mailto:|codex:)/.test(url)) return;
      const [rawPath, fragment] = url.split('#');
      const target = rawPath ? resolve(dirname(file), decodeURIComponent(rawPath)) : file;
      if (!existsSync(target)) {
        fail(`${file}: broken link ${url}`);
        return;
      }
      if (
        fragment &&
        extname(target) === '.md' &&
        !anchors(target).has(decodeURIComponent(fragment).toLowerCase())
      )
        fail(`${file}: missing anchor ${url}`);
    });
    visit(tree, 'code', (node) => {
      if (node.lang === 'mermaid') {
        const first = node.value.trim().split('\n')[0] ?? '';
        if (!/^(flowchart|sequenceDiagram|stateDiagram(?:-v2)?|erDiagram)\b/.test(first))
          fail(`${file}: unsupported Mermaid opening ${first}`);
      }
    });
  }
}
function markdownTargets(file: string, knownFiles: ReadonlySet<string>) {
  const targets = new Set<string>();
  const source = readFileSync(file, 'utf8');
  visit(parser.parse(source), 'link', (node) => {
    const url = node.url;
    if (/^(https?:|mailto:|codex:)/.test(url)) return;
    const [rawPath] = url.split('#');
    if (!rawPath) return;
    const target = resolve(dirname(file), decodeURIComponent(rawPath));
    if (extname(target) === '.md' && knownFiles.has(target)) targets.add(target);
  });
  return targets;
}

function validateDiscoverability(files: string[], entries: string[]) {
  const knownFiles = new Set(files.map((file) => resolve(file)));
  const visited = new Set<string>();
  const pending = entries.map((file) => resolve(file));

  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || visited.has(file) || !knownFiles.has(file)) continue;
    visited.add(file);
    pending.push(...markdownTargets(file, knownFiles));
  }

  for (const file of knownFiles) {
    if (!visited.has(file)) {
      fail(
        `${relative(workspace, file)}: public document is not reachable from README.md or AGENTS.md`,
      );
    }
  }
}

function validateReadmeParity(englishFile: string, chineseFile: string) {
  const english = readFileSync(englishFile, 'utf8');
  const chinese = readFileSync(chineseFile, 'utf8');

  if (!english.includes('(README.zh-TW.md)'))
    fail(`${englishFile}: missing Traditional Chinese link`);
  if (!chinese.includes('(README.md)')) fail(`${chineseFile}: missing English link`);

  const requiredLinks = [
    'docs/implementation-status.md',
    'docs/architecture/overview.md',
    'docs/engineering-capability-map.md',
    'docs/technology-choices.md',
    'docs/runbooks/local-development.md',
    'docs/runbooks/local-reset.md',
    'docs/testing/strategy.md',
    'docs/project-scope.md',
  ];
  const requiredCommands = [
    'nvm use',
    'pnpm install --frozen-lockfile',
    'export MOTORCOVE_ENV=demo-local',
    'pnpm dev:chain',
    'pnpm dev:bootstrap',
    'pnpm dev:full',
    'pnpm verify',
    'pnpm test:e2e',
    'pnpm demo:reset -- --yes',
  ];

  for (const [label, source, file] of [
    ['English', english, englishFile],
    ['Traditional Chinese', chinese, chineseFile],
  ] as const) {
    for (const link of requiredLinks) {
      if (!source.includes(link)) fail(`${file}: ${label} README missing required route ${link}`);
    }
    for (const command of requiredCommands) {
      if (!source.includes(command))
        fail(`${file}: ${label} README missing required command ${command}`);
    }
  }

  if (chinese.includes('pnpm demo:reset --yes')) {
    fail(`${chineseFile}: reset confirmation must be forwarded as pnpm demo:reset -- --yes`);
  }
}

function validateCommands(file: string, packagePath: string) {
  const data = JSON.parse(readFileSync(file, 'utf8')) as {
    commands: Array<{ name: string; command: string; status: string }>;
  };
  const scripts = (
    JSON.parse(readFileSync(packagePath, 'utf8')) as { scripts: Record<string, string> }
  ).scripts;
  const seen = new Set<string>();
  for (const item of data.commands) {
    if (seen.has(item.name)) fail(`${file}: duplicate command ${item.name}`);
    seen.add(item.name);
    if (!(item.name in scripts)) fail(`${file}: missing root script ${item.name}`);
    if (!item.command.startsWith('pnpm '))
      fail(`${file}: command must use root pnpm entry ${item.name}`);
  }
  for (const name of Object.keys(scripts)) {
    if (!seen.has(name)) fail(`${file}: undocumented root script ${name}`);
  }
}
const requiredScenarios = [
  'SALE-001',
  'SALE-002',
  'SALE-003',
  'SALE-004',
  'SALE-005',
  'TX-001',
  'TX-002',
  'TX-003',
  'TX-004',
  'TX-005',
  'TX-006',
  'TX-007',
  'IDX-001',
  'IDX-002',
  'IDX-003',
  'IDX-004',
  'REC-001',
  'ARCH-001',
  'REL-001',
];
function validateCapabilities(file: string, scenarioText: string) {
  const data = JSON.parse(readFileSync(file, 'utf8')) as {
    capabilities: Array<{ id: string; code: string[]; scenarios: string[] }>;
  };
  const expected = Array.from({ length: 18 }, (_, i) => `CAP-${String(i + 1).padStart(2, '0')}`);
  const ids = data.capabilities.map((item) => item.id);
  if (JSON.stringify(ids) !== JSON.stringify(expected))
    fail(`${file}: expected CAP-01 through CAP-18 in order`);
  const known = new Set([
    ...requiredScenarios,
    ...Array.from({ length: 70 }, (_, i) => `DB-${String(i + 1).padStart(2, '0')}`),
  ]);
  for (const item of data.capabilities) {
    for (const code of item.code)
      if (!existsSync(resolve(workspace, code)))
        fail(`${file}: missing code ref ${item.id} ${code}`);
    for (const scenario of item.scenarios)
      if (!known.has(scenario)) fail(`${file}: unknown scenario ${scenario}`);
  }
  for (const id of requiredScenarios)
    if (!scenarioText.includes(id)) fail(`scenario catalog missing ${id}`);
}
function validateEvidence(file: string) {
  const data = JSON.parse(readFileSync(file, 'utf8')) as {
    sourceContext: Record<string, unknown>;
    runs: Array<Record<string, unknown>>;
  };
  const allowed = new Set(['proposed', 'not run', 'executed/pass', 'executed/fail', 'blocked']);
  const seen = new Set<string>();
  for (const run of data.runs) {
    const id = String(run.id);
    if (seen.has(id)) fail(`${file}: duplicate run ${id}`);
    seen.add(id);
    if (!allowed.has(String(run.status))) fail(`${file}: invalid status ${String(run.status)}`);
    if (String(run.status).startsWith('executed/') && (!run.command || !run.result))
      fail(`${file}: executed run lacks command/result ${id}`);
    if (String(run.status).startsWith('executed/') && !run.executedAt)
      fail(`${file}: executed run lacks executedAt ${id}`);
  }
  if (!data.sourceContext.dirty || !data.sourceContext.sourceFingerprint)
    fail(`${file}: dirty evidence requires sourceFingerprint`);
}
function validateCapabilityEvidence(capabilityFile: string, evidenceFile: string) {
  const capabilities = JSON.parse(readFileSync(capabilityFile, 'utf8')) as {
    capabilities: Array<{ id: string; verification: string[] }>;
  };
  const evidence = JSON.parse(readFileSync(evidenceFile, 'utf8')) as {
    runs: Array<{ id: string }>;
  };
  const knownRuns = new Set(evidence.runs.map((run) => run.id));
  for (const capability of capabilities.capabilities) {
    for (const runId of capability.verification) {
      if (!knownRuns.has(runId))
        fail(`${capabilityFile}: ${capability.id} references unknown ${runId}`);
    }
  }
}

function fixture(path: string) {
  const fixtureCase = JSON.parse(readFileSync(resolve(path, 'case.json'), 'utf8')) as {
    kind: string;
  };
  const kind = fixtureCase.kind;
  if (kind === 'broken-link') markdownLinks(path, [resolve(path, 'README.md')]);
  if (kind === 'missing-script')
    validateCommands(resolve(path, 'commands.json'), resolve(workspace, 'package.json'));
  if (kind === 'unknown-scenario')
    validateCapabilities(resolve(path, 'capabilities.json'), requiredScenarios.join(' '));
  if (kind === 'false-evidence') validateEvidence(resolve(path, 'verification.json'));
  if (kind === 'generated-drift') {
    const content = readFileSync(resolve(path, 'document.md'), 'utf8');
    if (content.includes('| stale |')) fail('GENERATED_DOC_DRIFT fixture');
  }
  if (kind === 'readme-parity') {
    validateReadmeParity(resolve(path, 'README.md'), resolve(path, 'README.zh-TW.md'));
  }
  if (kind === 'orphan-document') {
    const files = [resolve(path, 'README.md'), resolve(path, 'orphan.md')];
    validateDiscoverability(files, [resolve(path, 'README.md')]);
  }
  if (kind === 'unknown-evidence') {
    validateCapabilityEvidence(
      resolve(path, 'capabilities.json'),
      resolve(path, 'verification.json'),
    );
  }
  if (
    ![
      'broken-link',
      'missing-script',
      'unknown-scenario',
      'false-evidence',
      'generated-drift',
      'readme-parity',
      'orphan-document',
      'unknown-evidence',
    ].includes(kind)
  ) {
    fail(`unknown fixture kind ${kind}`);
  }
}

const fixtureIndex = process.argv.indexOf('--fixture');
if (fixtureIndex >= 0) {
  const fixturePath = process.argv[fixtureIndex + 1];
  if (!fixturePath) throw new Error('FIXTURE_PATH_REQUIRED');
  fixture(resolve(fixturePath));
} else {
  const markdown = [
    resolve(workspace, 'README.md'),
    resolve(workspace, 'README.zh-TW.md'),
    resolve(workspace, 'AGENTS.md'),
    resolve(workspace, 'CONTRIBUTING.md'),
    ...walk(resolve(workspace, 'docs')).filter(
      (file) => file.endsWith('.md') && !file.includes('/internal/'),
    ),
  ];
  markdownLinks(workspace, markdown);
  validateDiscoverability(markdown, [
    resolve(workspace, 'README.md'),
    resolve(workspace, 'AGENTS.md'),
  ]);
  validateReadmeParity(resolve(workspace, 'README.md'), resolve(workspace, 'README.zh-TW.md'));
  validateCommands(
    resolve(workspace, 'docs/_meta/commands.json'),
    resolve(workspace, 'package.json'),
  );
  validateCapabilities(
    resolve(workspace, 'docs/_meta/capabilities.json'),
    readFileSync(resolve(workspace, 'docs/testing/scenario-catalog.md'), 'utf8'),
  );
  validateEvidence(resolve(workspace, 'docs/evidence/verification.json'));
  validateCapabilityEvidence(
    resolve(workspace, 'docs/_meta/capabilities.json'),
    resolve(workspace, 'docs/evidence/verification.json'),
  );

  const dbMatrix = readFileSync(
    resolve(workspace, 'docs/testing/database-acceptance-matrix.md'),
    'utf8',
  );
  for (let i = 1; i <= 70; i += 1) {
    const id = `DB-${String(i).padStart(2, '0')}`;
    if (!dbMatrix.includes(`| ${id} |`)) fail(`database matrix missing ${id}`);
  }

  const docMatrix = readFileSync(
    resolve(workspace, 'docs/testing/documentation-acceptance-matrix.md'),
    'utf8',
  );
  for (let i = 1; i <= 32; i += 1) {
    const id = `DOC-${String(i).padStart(2, '0')}`;
    if (!docMatrix.includes(`| ${id} |`)) fail(`documentation matrix missing ${id}`);
  }

  for (const file of markdown) {
    const content = readFileSync(file, 'utf8');
    if (/JD Match|Why hire me/i.test(content)) fail(`${file}: prohibited positioning`);
    if (/database[- ]?v2|consumer transition|reset and migrations moved/i.test(content))
      fail(`${file}: unpublished version-transition wording`);
    if (/(?:private key|mnemonic|seed phrase)\s*[:=]\s*[0-9a-f]{32,}/i.test(content))
      fail(`${file}: possible secret`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(JSON.stringify({ status: 'ok', mode: fixtureIndex >= 0 ? 'fixture' : 'workspace' }));
