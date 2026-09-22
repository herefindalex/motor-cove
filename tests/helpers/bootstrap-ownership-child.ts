import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { environmentPaths } from '@motorcove/database/environment';
import { withBootstrapOwnership } from '../../apps/indexer/src/cli/bootstrap-ownership.js';

const [workspaceRoot, environmentId, readyPath, releasePath, counterPath] = process.argv.slice(2);
if (!workspaceRoot || !environmentId || !readyPath || !releasePath || !counterPath)
  throw new Error('BOOTSTRAP_OWNERSHIP_HELPER_ARGS');

await withBootstrapOwnership(environmentPaths(workspaceRoot, environmentId), async () => {
  appendFileSync(counterPath, `${process.pid}\n`);
  writeFileSync(readyPath, 'ready\n');
  while (!existsSync(releasePath)) await wait(20);
});
