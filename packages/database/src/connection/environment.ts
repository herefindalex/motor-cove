import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { resolve, sep } from 'node:path';
import type { EnvironmentPaths } from '../types/index.js';

const slug = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;

export function assertEnvironmentId(environmentId: string): void {
  if (!slug.test(environmentId)) throw new Error('INVALID_ENVIRONMENT_ID');
}

export function environmentPaths(workspaceRoot: string, environmentId: string): EnvironmentPaths {
  assertEnvironmentId(environmentId);
  const root = resolve(workspaceRoot);
  const managedRoot = resolve(root, '.motorcove');
  const environmentDir = resolve(managedRoot, 'environments', environmentId);
  const locksDir = resolve(managedRoot, 'locks', environmentId);
  return {
    workspaceRoot: root,
    managedRoot,
    environmentId,
    environmentDir,
    databaseDir: resolve(environmentDir, 'database'),
    databasePath: resolve(environmentDir, 'database', 'motorcove.sqlite'),
    ownerPath: resolve(environmentDir, 'owner.json'),
    maintenancePath: resolve(environmentDir, 'maintenance.json'),
    deploymentPath: resolve(environmentDir, 'deployment.json'),
    bootstrapReceiptPath: resolve(environmentDir, 'bootstrap-receipt.json'),
    seedJournalPath: resolve(environmentDir, 'seed-journal.json'),
    reportsDir: resolve(environmentDir, 'reports'),
    backupsDir: resolve(managedRoot, 'backups', environmentId),
    serviceLockPath: resolve(locksDir, 'service.lock'),
    writerLockPath: resolve(locksDir, 'writer.lock'),
  };
}

function assertContained(realRoot: string, candidate: string): void {
  if (candidate !== realRoot && !candidate.startsWith(`${realRoot}${sep}`))
    throw new Error('DB_NOT_OWNED: path escapes managed root');
}

export function initializeOwnedEnvironment(paths: EnvironmentPaths): void {
  mkdirSync(resolve(paths.managedRoot, 'environments'), { recursive: true });
  mkdirSync(resolve(paths.managedRoot, 'locks', paths.environmentId), { recursive: true });
  mkdirSync(paths.databaseDir, { recursive: true });
  mkdirSync(paths.reportsDir, { recursive: true });
  mkdirSync(paths.backupsDir, { recursive: true });
  for (const path of [paths.serviceLockPath, paths.writerLockPath])
    if (!existsSync(path)) writeFileSync(path, '', { flag: 'wx' });
  if (!existsSync(paths.ownerPath))
    writeFileSync(
      paths.ownerPath,
      `${JSON.stringify({ formatVersion: 1, project: 'motorcove', environmentId: paths.environmentId, createdAt: new Date().toISOString() }, null, 2)}\n`,
      { flag: 'wx' },
    );
  verifyOwnedEnvironment(paths);
}

export function verifyOwnedEnvironment(paths: EnvironmentPaths): void {
  if (!existsSync(paths.ownerPath)) throw new Error('DB_NOT_OWNED: owner.json missing');
  if (lstatSync(paths.environmentDir).isSymbolicLink()) throw new Error('DB_NOT_OWNED: symlink');
  const realManaged = realpathSync(paths.managedRoot);
  assertContained(realManaged, realpathSync(paths.environmentDir));
  assertContained(
    realManaged,
    realpathSync(resolve(paths.managedRoot, 'locks', paths.environmentId)),
  );
  const owner = JSON.parse(readFileSync(paths.ownerPath, 'utf8')) as Record<string, unknown>;
  if (
    owner.formatVersion !== 1 ||
    owner.project !== 'motorcove' ||
    owner.environmentId !== paths.environmentId
  )
    throw new Error('DB_NOT_OWNED: owner identity mismatch');
}
