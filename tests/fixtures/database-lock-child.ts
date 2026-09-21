import { environmentPaths } from '../../packages/database/src/connection/environment.js';
import { acquireRuntimeLocks } from '../../packages/database/src/connection/flock.js';

const [root, environmentId] = process.argv.slice(2);
if (!root || !environmentId) throw new Error('Expected workspace root and environment ID');

await acquireRuntimeLocks(environmentPaths(root, environmentId), true);
process.stdout.write('READY\n');
await new Promise<void>(() => undefined);
