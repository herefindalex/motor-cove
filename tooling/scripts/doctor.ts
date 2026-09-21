import { execFileSync } from 'node:child_process';

const requiredNode = [24, 21];
const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
const checks: Array<[string, () => string]> = [
  ['Node.js', () => process.versions.node],
  ['pnpm', () => execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim()],
  [
    'Forge',
    () => execFileSync('forge', ['--version'], { encoding: 'utf8' }).split('\n')[0] ?? 'unknown',
  ],
  [
    'Anvil',
    () => execFileSync('anvil', ['--version'], { encoding: 'utf8' }).split('\n')[0] ?? 'unknown',
  ],
  [
    'SQLite',
    () => execFileSync('sqlite3', ['--version'], { encoding: 'utf8' }).split(' ')[0] ?? 'unknown',
  ],
];
let failed = major < requiredNode[0] || (major === requiredNode[0] && minor < requiredNode[1]);
for (const [name, value] of checks) {
  try {
    console.log(`${name}: ${value()}`);
  } catch (error) {
    failed = true;
    console.error(
      `${name}: unavailable (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}
if (failed) process.exit(1);
