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

export async function backupEnvironment(
  paths: EnvironmentPaths,
  options: { locksAlreadyHeld?: boolean; reason?: string } = {},
) {
  verifyOwnedEnvironment(paths);
  if (!existsSync(paths.databasePath)) throw new Error('DB_NOT_INITIALIZED');
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
    for (const [sourcePath, name] of [
      [paths.deploymentPath, 'deployment.json'],
      [paths.bootstrapReceiptPath, 'bootstrap-receipt.json'],
      [paths.seedJournalPath, 'seed-journal.json'],
    ] as const)
      if (existsSync(sourcePath)) copyFileSync(sourcePath, resolve(staging, name));
    const engineDb = new Database(':memory:');
    const sqliteEngine = engineDb.prepare('select sqlite_version() version').get();
    engineDb.close();
    const manifest = {
      formatVersion: 1,
      backupId,
      environmentId: paths.environmentId,
      reason: options.reason ?? 'manual',
      createdAt: new Date().toISOString(),
      databaseSha256: fileHash(resolve(staging, 'database.sqlite')),
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
