export const PROJECTOR_VERSION = '2';

export interface ProjectionProvenance {
  readonly deploymentId: string;
  readonly indexedBlockNumber: string;
  readonly indexedBlockHash: string;
  readonly projectorVersion: string;
  readonly projectionBuildId: string;
  readonly logScopeHash: string;
}

export interface EnvironmentPaths {
  readonly workspaceRoot: string;
  readonly managedRoot: string;
  readonly environmentId: string;
  readonly environmentDir: string;
  readonly databaseDir: string;
  readonly databasePath: string;
  readonly ownerPath: string;
  readonly maintenancePath: string;
  readonly deploymentPath: string;
  readonly bootstrapReceiptPath: string;
  readonly seedJournalPath: string;
  readonly nodeBindingPath: string;
  readonly reportsDir: string;
  readonly backupsDir: string;
  readonly serviceLockPath: string;
  readonly writerLockPath: string;
  readonly bootstrapLockPath: string;
}

export interface MaintenanceMarker {
  readonly operationId: string;
  readonly operationType: string;
  readonly stage: string;
  readonly environmentId: string;
  readonly targetDatabase: string;
  readonly expectedSchemaContract: string;
  readonly expectedMigrationBundleDigest?: string;
  readonly expectedDeploymentId?: string;
  readonly reindexFromBlock?: string;
  readonly targetBlock?: string;
  readonly targetHash?: string;
  readonly projectionPhase?: 'PREPARING' | 'CATCHING_UP';
  readonly resetPhase?: 'PREPARED' | 'CHAIN_RESET' | 'LOCAL_STATE_CLEARED';
  readonly backupId?: string;
  readonly transitionedFromOperationId?: string;
  readonly transitionedFromOperationType?: string;
  readonly transitionedFromLastError?: string;
  readonly startedAt: string;
  readonly lastError?: string;
}

export { canonicalUint256, parseUint256, positiveUint256, uint256Max } from '../codecs/uint256.js';
export { canonicalAddress, canonicalHash, safeInteger } from '../codecs/evm.js';
