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
import { acquireMaintenanceLocks } from '../connection/flock.js';
import { verifyOwnedEnvironment } from '../connection/environment.js';
import type { EnvironmentPaths } from '../types/index.js';
import { verifyKnownSourceDatabase } from './migrations.js';

const fileHash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

const sidecars = [
  ['deployment', 'deployment.json'],
  ['bootstrapReceipt', 'bootstrap-receipt.json'],
  ['seedJournal', 'seed-journal.json'],
] as const;

function databaseDeploymentId(db: Database.Database): string {
  const rows = db.prepare('SELECT deployment_id AS deploymentId FROM deployments').all() as Array<{
    deploymentId: string;
  }>;
  if (rows.length !== 1 || !rows[0]) throw new Error('BACKUP_INVALID: deployment identity');
  return rows[0].deploymentId;
}

function databaseDeploymentIdFromPath(path: string): string {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    return databaseDeploymentId(db);
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
  options: { locksAlreadyHeld?: boolean; reason?: string } = {},
) {
  verifyOwnedEnvironment(paths);
  if (!existsSync(paths.databasePath)) throw new Error('DB_NOT_INITIALIZED');
  if (!existsSync(paths.deploymentPath))
    throw new Error('BACKUP_INVALID: deployment sidecar required');
  const expectedDeploymentId = deploymentSidecarId(paths.deploymentPath);
  const locks = options.locksAlreadyHeld ? undefined : await acquireMaintenanceLocks(paths);
  const backupId = `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const staging = resolve(paths.backupsDir, `.${backupId}.incomplete`);
  const destination = resolve(paths.backupsDir, backupId);
  mkdirSync(staging, { recursive: true });
  try {
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
    for (const [sourcePath, name] of sourceSidecars)
      if (existsSync(sourcePath)) copyFileSync(sourcePath, resolve(staging, name));
    const engineDb = new Database(':memory:');
    const sqliteEngine = engineDb.prepare('select sqlite_version() version').get();
    engineDb.close();
    const snapshotDeploymentId = databaseDeploymentIdFromPath(resolve(staging, 'database.sqlite'));
    if (snapshotDeploymentId !== expectedDeploymentId)
      throw new Error('BACKUP_INVALID: deployment identity');
    const manifest = {
      formatVersion: 2,
      backupId,
      environmentId: paths.environmentId,
      reason: options.reason ?? 'manual',
      createdAt: new Date().toISOString(),
      databaseSha256: fileHash(resolve(staging, 'database.sqlite')),
      deploymentId: snapshotDeploymentId,
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
    await locks?.release();
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
    if (manifest.formatVersion !== 2 || manifest.deploymentId !== databaseDeploymentId(db))
      throw new Error('BACKUP_INVALID: deployment identity');
    if (typeof manifest.sidecars !== 'object' || manifest.sidecars === null)
      throw new Error('BACKUP_INVALID: sidecar evidence');
    const evidence = manifest.sidecars as Record<
      string,
      { present?: unknown; sha256?: unknown } | undefined
    >;
    if (evidence.deployment?.present !== true)
      throw new Error('BACKUP_INVALID: deployment sidecar required');
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
    const deploymentSidecar = resolve(directory, 'deployment.json');
    if (existsSync(deploymentSidecar)) {
      if (deploymentSidecarId(deploymentSidecar) !== manifest.deploymentId)
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
  return { directory, databasePath, manifest };
}
