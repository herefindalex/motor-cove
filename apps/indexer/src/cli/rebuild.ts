import { openProjectionWriter } from '@motorcove/database/projection-writer';
import { SqliteProjectionStore } from '../adapters/sqlite/sqlite-projection-store.js';
import { loadConfig, logScopeHash } from '../runtime/config.js';

const config = loadConfig();
const writer = await openProjectionWriter(config.environment);
try {
  const result = new SqliteProjectionStore(
    writer.database,
    config.manifest.deploymentId,
    config.manifest.nft.address,
    logScopeHash(config.manifest),
  ).rebuildFromJournal();
  console.log(
    JSON.stringify({
      service: 'rebuild',
      status: 'complete',
      deploymentId: config.manifest.deploymentId,
      ...result,
    }),
  );
} finally {
  await writer.close();
}
