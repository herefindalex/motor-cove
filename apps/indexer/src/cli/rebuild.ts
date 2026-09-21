import { runProjectionMaintenance } from '@motorcove/database/maintenance';
import { SqliteProjectionStore } from '../adapters/sqlite/sqlite-projection-store.js';
import { loadConfig, logScopeHash } from '../runtime/config.js';

const config = loadConfig();
const operation = await runProjectionMaintenance(config.environment, {
  operationType: 'REBUILD_PROJECTION',
  expectedDeploymentId: config.manifest.deploymentId,
  run: (database) =>
    new SqliteProjectionStore(
      database,
      config.manifest.deploymentId,
      config.manifest.nft.address,
      logScopeHash(config.manifest),
    ).rebuildFromJournal(),
});
console.log(
  JSON.stringify({
    service: 'rebuild',
    status: 'complete',
    operationId: operation.operationId,
    deploymentId: config.manifest.deploymentId,
    ...operation.result,
  }),
);
