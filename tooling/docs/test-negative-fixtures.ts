import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, 'fixtures');
const failures: string[] = [];
for (const name of readdirSync(root)) {
  const path = resolve(root, name);
  if (!statSync(path).isDirectory()) continue;
  const result = spawnSync('pnpm', ['exec', 'tsx', 'tooling/docs/check.ts', '--fixture', path], {
    cwd: resolve(import.meta.dirname, '../..'),
    encoding: 'utf8',
  });
  if (result.status === 0) failures.push(`${name}: invalid fixture unexpectedly passed`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(JSON.stringify({ status: 'ok', fixtures: readdirSync(root).length }));
