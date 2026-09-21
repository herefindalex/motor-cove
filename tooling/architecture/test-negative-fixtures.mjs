import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('tooling/architecture/fixtures');
const fixtures = fs
  .readdirSync(root)
  .filter((name) => fs.statSync(path.join(root, name)).isDirectory());
const failures = [];
for (const fixture of fixtures) {
  const result = spawnSync(
    process.execPath,
    ['tooling/architecture/check.mjs', '--fixture', path.join(root, fixture)],
    { encoding: 'utf8' },
  );
  if (result.status === 0) failures.push(`${fixture}: invalid fixture unexpectedly passed`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Architecture negative fixtures rejected (${fixtures.length}).`);
