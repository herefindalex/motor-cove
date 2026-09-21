import { environmentPaths, runProjectionMaintenance } from '@motorcove/database/maintenance';
import { SqliteProjectionStore } from '../../apps/indexer/src/adapters/sqlite/sqlite-projection-store.js';

const [root, environmentId, deploymentId, nftAddress, logScopeHash, fromBlock] =
  process.argv.slice(2);
if (!root || !environmentId || !deploymentId || !nftAddress || !logScopeHash || !fromBlock)
  throw new Error('INTERRUPTED_REINDEX_ARGUMENTS_REQUIRED');

await runProjectionMaintenance(environmentPaths(root, environmentId), {
  operationType: 'REINDEX_PROJECTION',
  expectedDeploymentId: deploymentId,
  recovery: {
    reindexFromBlock: fromBlock,
    targetBlock: '1',
    targetHash: `0x${'2'.repeat(64)}`,
  },
  run: async (database) => {
    const store = new SqliteProjectionStore(database, deploymentId, nftAddress, logScopeHash);
    store.rewindFrom(BigInt(fromBlock));
    process.stdout.write('REWIND_COMMITTED\n');
    await new Promise<never>(() => undefined);
  },
});
