import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { protocolVersion } from '@motorcove/chain-artifacts';
const root = process.cwd();
const pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf8')) as { version: string };
let revision: string | null = null;
let dirty = true;
try {
  revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  dirty =
    execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length >
    0;
} catch {
  /* source archive */
}
const manifest = {
  buildIdentification: `motorcove-${pkg.version}`,
  revision,
  dirty,
  protocolVersion,
  abiVersion: protocolVersion,
  apiContractVersion: '0.1.0',
  databaseSchemaVersion: 1,
  node: process.versions.node,
};
writeFileSync(`${root}/release-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest));
