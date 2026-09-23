export {
  environmentPaths,
  initializeOwnedEnvironment,
  verifyOwnedEnvironment,
} from '../connection/environment.js';
export {
  acquireBootstrapOwnership,
  acquireBootstrapReadOwnership,
  acquireMaintenanceLocks,
} from '../connection/flock.js';
export { backupEnvironment, verifyBackup, verifyMaintenanceBackup } from './backup.js';
export {
  parseBootstrapReceipt,
  readBootstrapReceipt,
  publishImmutableJson,
  type BootstrapReceipt,
} from './immutable-sidecar.js';
export { restoreEnvironment } from './restore.js';
export { resetEnvironment } from './reset.js';
export {
  claimManagedNode,
  verifyManagedNodeOwnership,
  canonicalManagedNodeEndpoint,
} from './managed-node.js';
export { recoverEnvironment } from './recovery.js';
export { registerDeployment, type DeploymentRegistration } from './deployment-registration.js';
export { seedCatalog, catalogSeedDigest, type CatalogSeedSet } from './catalog-seed.js';
export { migrateEnvironment } from './migration-operation.js';
export {
  runProjectionMaintenance,
  type ProjectionMaintenanceOptions,
} from './projection-operation.js';
export { openReconciliationDatabase } from './reconciliation-database.js';
export {
  inspectEnvironment,
  verifyDatabase,
  verifyKnownSourceDatabase,
  loadSchemaContract,
  migrationBundle,
  migrationBundleDigest,
  schemaFingerprint,
  schemaSourceDigest,
  normalizedSchema,
  readNativeHistory,
  assertKnownHistory,
  type MigrationDescriptor,
} from './migrations.js';
