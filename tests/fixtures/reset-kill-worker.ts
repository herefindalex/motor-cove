import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { environmentPaths, resetEnvironment } from '@motorcove/database/maintenance';

const [workspaceRoot, environmentId] = process.argv.slice(2);
if (!workspaceRoot || !environmentId) throw new Error('reset kill fixture arguments required');

const paths = environmentPaths(workspaceRoot, environmentId);
await resetEnvironment(paths, true, {
  resetChain: async () => {
    writeFileSync(resolve(paths.environmentDir, 'chain-generation.txt'), 'reset\n', {
      flush: true,
    });
    process.stdout.write('CHAIN_RESET_COMPLETE\n');
    await new Promise<never>(() => undefined);
  },
});
