export {
  environmentPaths,
  initializeOwnedEnvironment,
  verifyOwnedEnvironment,
} from '../connection/environment.js';
export { acquireMaintenanceLocks } from '../connection/flock.js';
export { backupEnvironment, verifyBackup } from './backup.js';
export { restoreEnvironment } from './restore.js';
export { resetEnvironment } from './reset.js';
export { recoverEnvironment } from './recovery.js';
export { registerDeployment, type DeploymentRegistration } from './deployment-registration.js';
export { seedCatalog, catalogSeedDigest, type CatalogSeedSet } from './catalog-seed.js';
export { migrateEnvironment } from './migration-operation.js';
export {
  runProjectionMaintenance,
  type ProjectionMaintenanceOptions,
} from './projection-operation.js';
export {
  inspectEnvironment,
  verifyDatabase,
  loadSchemaContract,
  migrationBundle,
  migrationBundleDigest,
  schemaFingerprint,
  schemaSourceDigest,
  normalizedSchema,
  readNativeHistory,
  assertKnownHistory,
} from './migrations.js';
