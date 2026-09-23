import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  acquireBootstrapReadOwnership,
  acquireMaintenanceLocks,
  type AdvisoryLock,
} from '../connection/flock.js';
import { verifyOwnedEnvironment } from '../connection/environment.js';
import type { EnvironmentPaths, MaintenanceMarker } from '../types/index.js';
import { verifyKnownSourceDatabase } from './migrations.js';

const fileHash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

const sidecars = [
  ['deployment', 'deployment.json'],
  ['bootstrapReceipt', 'bootstrap-receipt.json'],
  ['seedJournal', 'seed-journal.json'],
] as const;

type BackupDeploymentIdentity =
  | { readonly state: 'PREDEPLOYMENT'; readonly deploymentId: null }
  | { readonly state: 'DEPLOYED'; readonly deploymentId: string };

export type BackupMaintenancePurpose = 'MIGRATION_SAFETY' | 'SOURCE_REFRESH_ARCHIVE';

export interface BackupEnvironmentOptions {
  readonly locksAlreadyHeld?: boolean;
  readonly bootstrapOwnershipAlreadyHeld?: boolean;
  readonly reason?: string;
  readonly maintenance?: {
    readonly operationId: string;
    readonly purpose: BackupMaintenancePurpose;
  };
}

type BackupSourceCondition =
  | { readonly state: 'READY' }
  | {
      readonly state: 'MAINTENANCE_INCOMPLETE';
      readonly operationId: string;
      readonly operationType: string;
      readonly stage: string;
      readonly purpose: BackupMaintenancePurpose;
      readonly markerSha256: string;
      readonly projectionPhase: 'PREPARING' | 'CATCHING_UP' | null;
    };

type ProjectionEvidence =
  | { readonly state: 'NOT_INITIALIZED'; readonly deploymentId: string }
  | {
      readonly state: 'OBSERVED';
      readonly deploymentId: string;
      readonly checkpointBlock: string | null;
      readonly checkpointHash: string | null;
      readonly projectorVersion: string;
      readonly projectionBuildId: string;
      readonly logScopeHash: string;
      readonly projectionStatus: string;
      readonly recoveryReason: string | null;
    };

function readSourceCondition(
  paths: EnvironmentPaths,
  options: BackupEnvironmentOptions,
): BackupSourceCondition {
  if (!existsSync(paths.maintenancePath)) {
    if (options.maintenance) throw new Error('BACKUP_MAINTENANCE_CONTEXT_MISMATCH');
    return { state: 'READY' };
  }
  if (!options.maintenance) throw new Error('MAINTENANCE_INCOMPLETE');
  const bytes = readFileSync(paths.maintenancePath, 'utf8');
  let marker: MaintenanceMarker;
  try {
    marker = JSON.parse(bytes) as MaintenanceMarker;
  } catch {
    throw new Error('MAINTENANCE_INCOMPLETE');
  }
  const expectedType =
    options.maintenance.purpose === 'MIGRATION_SAFETY' ? 'MIGRATE' : 'REINDEX_PROJECTION';
  if (
    marker.operationId !== options.maintenance.operationId ||
    marker.operationType !== expectedType ||
    marker.environmentId !== paths.environmentId ||
    marker.targetDatabase !== paths.databasePath
  )
    throw new Error('BACKUP_MAINTENANCE_CONTEXT_MISMATCH');
  return {
    state: 'MAINTENANCE_INCOMPLETE',
    operationId: marker.operationId,
    operationType: marker.operationType,
    stage: marker.stage,
    purpose: options.maintenance.purpose,
    markerSha256: createHash('sha256').update(bytes).digest('hex'),
    projectionPhase: marker.projectionPhase ?? null,
  };
}

function projectionEvidence(
  db: Database.Database,
  identity: BackupDeploymentIdentity,
): ProjectionEvidence | null {
  if (identity.state === 'PREDEPLOYMENT') return null;
  const checkpoint = db
    .prepare(
      `SELECT last_scanned_block AS checkpointBlock,
              last_scanned_hash AS checkpointHash,
              projector_version AS projectorVersion,
              projection_build_id AS projectionBuildId,
              log_scope_hash AS logScopeHash
       FROM indexer_checkpoint WHERE deployment_id=?`,
    )
    .get(identity.deploymentId) as
    | {
        checkpointBlock: number | null;
        checkpointHash: string | null;
        projectorVersion: string;
        projectionBuildId: string;
        logScopeHash: string;
      }
    | undefined;
  const runtime = db
    .prepare(
      `SELECT projection_status AS projectionStatus,recovery_reason AS recoveryReason
       FROM indexer_runtime_status WHERE deployment_id=?`,
    )
    .get(identity.deploymentId) as
    | { projectionStatus: string; recoveryReason: string | null }
    | undefined;
  if (!checkpoint && !runtime)
    return { state: 'NOT_INITIALIZED', deploymentId: identity.deploymentId };
  if (!checkpoint || !runtime) throw new Error('BACKUP_INVALID: projection evidence');
  return {
    state: 'OBSERVED',
    deploymentId: identity.deploymentId,
    checkpointBlock: checkpoint.checkpointBlock?.toString() ?? null,
    checkpointHash: checkpoint.checkpointHash,
    projectorVersion: checkpoint.projectorVersion,
    projectionBuildId: checkpoint.projectionBuildId,
    logScopeHash: checkpoint.logScopeHash,
    projectionStatus: runtime.projectionStatus,
    recoveryReason: runtime.recoveryReason,
  };
}

function databaseDeploymentIdentity(db: Database.Database): BackupDeploymentIdentity {
  const rows = db.prepare('SELECT deployment_id AS deploymentId FROM deployments').all() as Array<{
    deploymentId: string;
  }>;
  if (rows.length === 0) return { state: 'PREDEPLOYMENT', deploymentId: null };
  if (rows.length !== 1 || !rows[0]) throw new Error('BACKUP_INVALID: deployment identity');
  return { state: 'DEPLOYED', deploymentId: rows[0].deploymentId };
}

function databaseDeploymentIdentityFromPath(path: string): BackupDeploymentIdentity {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    return databaseDeploymentIdentity(db);
  } finally {
    db.close();
  }
}

function deploymentSidecarId(path: string): string {
  let deployment: unknown;
  try {
    deployment = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    throw new Error('BACKUP_INVALID: sidecar deployment.json');
  }
  if (
    typeof deployment !== 'object' ||
    deployment === null ||
    !('deploymentId' in deployment) ||
    typeof deployment.deploymentId !== 'string'
  )
    throw new Error('BACKUP_INVALID: sidecar deployment.json');
  return deployment.deploymentId;
}

export async function backupEnvironment(
  paths: EnvironmentPaths,
  options: BackupEnvironmentOptions = {},
) {
  verifyOwnedEnvironment(paths);
  if (!existsSync(paths.databasePath)) throw new Error('DB_NOT_INITIALIZED');
  const backupId = `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const staging = resolve(paths.backupsDir, `.${backupId}.incomplete`);
  const destination = resolve(paths.backupsDir, backupId);
  let bootstrapGate: AdvisoryLock | undefined;
  let locks: AdvisoryLock | undefined;
  try {
    bootstrapGate = options.bootstrapOwnershipAlreadyHeld
      ? undefined
      : await acquireBootstrapReadOwnership(paths);
    locks = options.locksAlreadyHeld ? undefined : await acquireMaintenanceLocks(paths);
    const sourceCondition = readSourceCondition(paths, options);
    mkdirSync(staging, { recursive: true });
    const source = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
    try {
      await source.backup(resolve(staging, 'database.sqlite'));
    } finally {
      source.close();
    }
    const snapshot = new Database(resolve(staging, 'database.sqlite'), {
      readonly: true,
      fileMustExist: true,
    });
    let verification;
    try {
      verification = verifyKnownSourceDatabase(snapshot);
    } finally {
      snapshot.close();
    }
    const sourceSidecars = [
      [paths.deploymentPath, 'deployment.json'],
      [paths.bootstrapReceiptPath, 'bootstrap-receipt.json'],
      [paths.seedJournalPath, 'seed-journal.json'],
    ] as const;
    const snapshotDeployment = databaseDeploymentIdentityFromPath(
      resolve(staging, 'database.sqlite'),
    );
    const snapshotDb = new Database(resolve(staging, 'database.sqlite'), {
      readonly: true,
      fileMustExist: true,
    });
    let snapshotProjection: ProjectionEvidence | null;
    try {
      snapshotProjection = projectionEvidence(snapshotDb, snapshotDeployment);
    } finally {
      snapshotDb.close();
    }
    if (snapshotDeployment.state === 'DEPLOYED') {
      if (!existsSync(paths.deploymentPath))
        throw new Error('BACKUP_INVALID: deployment sidecar required');
      if (deploymentSidecarId(paths.deploymentPath) !== snapshotDeployment.deploymentId)
        throw new Error('BACKUP_INVALID: deployment identity');
    } else if (sourceSidecars.some(([sourcePath]) => existsSync(sourcePath))) {
      throw new Error('BACKUP_INVALID: predeployment sidecar state');
    }
    for (const [sourcePath, name] of sourceSidecars)
      if (existsSync(sourcePath)) copyFileSync(sourcePath, resolve(staging, name));
    if (
      snapshotDeployment.state === 'DEPLOYED' &&
      existsSync(resolve(staging, 'seed-journal.json')) !==
        existsSync(resolve(staging, 'bootstrap-receipt.json'))
    )
      throw new Error('BACKUP_INVALID: bootstrap lifecycle incomplete');
    const engineDb = new Database(':memory:');
    const sqliteEngine = engineDb.prepare('select sqlite_version() version').get();
    engineDb.close();
    const manifest = {
      formatVersion: 3,
      backupId,
      environmentId: paths.environmentId,
      reason: options.reason ?? 'manual',
      createdAt: new Date().toISOString(),
      databaseSha256: fileHash(resolve(staging, 'database.sqlite')),
      deploymentState: snapshotDeployment.state,
      deploymentId: snapshotDeployment.deploymentId,
      restorePolicy: sourceCondition.state === 'READY' ? 'STANDARD' : 'EVIDENCE_ONLY',
      sourceCondition,
      projectionEvidence: snapshotProjection,
      sidecars: Object.fromEntries(
        sidecars.map(([name, file]) => {
          const path = resolve(staging, file);
          return [
            name,
            existsSync(path) ? { present: true, sha256: fileHash(path) } : { present: false },
          ];
        }),
      ),
      schemaContractVersion: verification.contractVersion,
      migrationCount: verification.historyCount,
      migrationBundleDigest: verification.migrationBundleDigest,
      schemaFingerprint: verification.fingerprint,
      sqliteEngine,
      includesChainState: false,
    };
    writeFileSync(
      resolve(staging, 'backup-manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { flush: true },
    );
    writeFileSync(
      resolve(staging, 'verification.json'),
      `${JSON.stringify(verification, null, 2)}\n`,
      { flush: true },
    );
    renameSync(staging, destination);
    return { backupId, path: destination, manifest, verification };
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  } finally {
    try {
      await locks?.release();
    } finally {
      await bootstrapGate?.release();
    }
  }
}

export function verifyBackup(paths: EnvironmentPaths, backupId: string) {
  if (!/^[0-9TZ-]+-[0-9a-f]{8}$/.test(backupId)) throw new Error('BACKUP_INVALID: invalid id');
  const directory = resolve(paths.backupsDir, backupId);
  const databasePath = resolve(directory, 'database.sqlite');
  const manifestPath = resolve(directory, 'backup-manifest.json');
  if (!existsSync(databasePath) || !existsSync(manifestPath))
    throw new Error('BACKUP_INVALID: incomplete');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  if (
    manifest.environmentId !== paths.environmentId ||
    manifest.databaseSha256 !== fileHash(databasePath)
  )
    throw new Error('BACKUP_INVALID: identity or checksum');
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const verification = verifyKnownSourceDatabase(db);
    const snapshotDeployment = databaseDeploymentIdentity(db);
    const snapshotProjection = projectionEvidence(db, snapshotDeployment);
    const deploymentState =
      manifest.deploymentState ??
      (typeof manifest.deploymentId === 'string' ? 'DEPLOYED' : undefined);
    if (
      manifest.formatVersion !== 3 ||
      deploymentState !== snapshotDeployment.state ||
      manifest.deploymentId !== snapshotDeployment.deploymentId
    )
      throw new Error('BACKUP_INVALID: deployment identity');
    const sourceCondition = manifest.sourceCondition as Record<string, unknown> | undefined;
    const sourceReady = sourceCondition?.state === 'READY' && manifest.restorePolicy === 'STANDARD';
    const maintenanceEvidence =
      sourceCondition?.state === 'MAINTENANCE_INCOMPLETE' &&
      manifest.restorePolicy === 'EVIDENCE_ONLY' &&
      typeof sourceCondition.operationId === 'string' &&
      typeof sourceCondition.operationType === 'string' &&
      typeof sourceCondition.stage === 'string' &&
      typeof sourceCondition.markerSha256 === 'string' &&
      /^[0-9a-f]{64}$/.test(sourceCondition.markerSha256) &&
      (sourceCondition.purpose === 'MIGRATION_SAFETY' ||
        sourceCondition.purpose === 'SOURCE_REFRESH_ARCHIVE') &&
      (sourceCondition.projectionPhase === null ||
        sourceCondition.projectionPhase === 'PREPARING' ||
        sourceCondition.projectionPhase === 'CATCHING_UP') &&
      ((sourceCondition.purpose === 'MIGRATION_SAFETY' &&
        sourceCondition.operationType === 'MIGRATE') ||
        (sourceCondition.purpose === 'SOURCE_REFRESH_ARCHIVE' &&
          sourceCondition.operationType === 'REINDEX_PROJECTION'));
    if (!sourceReady && !maintenanceEvidence) throw new Error('BACKUP_INVALID: source condition');
    if (!isDeepStrictEqual(manifest.projectionEvidence, snapshotProjection))
      throw new Error('BACKUP_INVALID: projection evidence');
    if (typeof manifest.sidecars !== 'object' || manifest.sidecars === null)
      throw new Error('BACKUP_INVALID: sidecar evidence');
    const evidence = manifest.sidecars as Record<
      string,
      { present?: unknown; sha256?: unknown } | undefined
    >;
    for (const [name, file] of sidecars) {
      const expected = evidence[name];
      const path = resolve(directory, file);
      if (
        !expected ||
        typeof expected.present !== 'boolean' ||
        expected.present !== existsSync(path) ||
        (expected.present &&
          (typeof expected.sha256 !== 'string' || expected.sha256 !== fileHash(path)))
      )
        throw new Error(`BACKUP_INVALID: sidecar ${file}`);
    }
    if (snapshotDeployment.state === 'DEPLOYED' && evidence.deployment?.present !== true)
      throw new Error('BACKUP_INVALID: deployment sidecar required');
    if (
      snapshotDeployment.state === 'DEPLOYED' &&
      evidence.seedJournal?.present !== evidence.bootstrapReceipt?.present
    )
      throw new Error('BACKUP_INVALID: bootstrap lifecycle incomplete');
    if (
      snapshotDeployment.state === 'PREDEPLOYMENT' &&
      Object.values(evidence).some((entry) => entry?.present === true)
    )
      throw new Error('BACKUP_INVALID: predeployment sidecar state');
    const deploymentSidecar = resolve(directory, 'deployment.json');
    if (existsSync(deploymentSidecar)) {
      if (deploymentSidecarId(deploymentSidecar) !== snapshotDeployment.deploymentId)
        throw new Error('BACKUP_INVALID: sidecar deployment.json');
    }
    if (
      manifest.schemaContractVersion !== verification.contractVersion ||
      manifest.migrationCount !== verification.historyCount ||
      manifest.migrationBundleDigest !== verification.migrationBundleDigest ||
      manifest.schemaFingerprint !== verification.fingerprint
    )
      throw new Error('BACKUP_INVALID: source schema evidence');
  } finally {
    db.close();
  }
  return {
    directory,
    databasePath,
    manifest: {
      ...manifest,
      databaseSha256: manifest.databaseSha256,
      deploymentId: manifest.deploymentId,
      deploymentState:
        manifest.deploymentState ??
        (typeof manifest.deploymentId === 'string' ? 'DEPLOYED' : undefined),
      restorePolicy: manifest.restorePolicy as 'STANDARD' | 'EVIDENCE_ONLY',
      sourceCondition: manifest.sourceCondition as BackupSourceCondition,
      projectionEvidence: manifest.projectionEvidence as ProjectionEvidence | null,
    },
  };
}

export function verifyMaintenanceBackup(
  paths: EnvironmentPaths,
  backupId: string,
  maintenance: { readonly operationId: string; readonly purpose: BackupMaintenancePurpose },
) {
  const backup = verifyBackup(paths, backupId);
  const condition = backup.manifest.sourceCondition;
  if (
    backup.manifest.restorePolicy !== 'EVIDENCE_ONLY' ||
    condition.state !== 'MAINTENANCE_INCOMPLETE' ||
    condition.operationId !== maintenance.operationId ||
    condition.purpose !== maintenance.purpose
  )
    throw new Error('BACKUP_MAINTENANCE_CONTEXT_MISMATCH');
  return backup;
}
