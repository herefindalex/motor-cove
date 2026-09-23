import Database from 'better-sqlite3';
import { spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import {
  acquireBootstrapOwnership,
  backupEnvironment,
  migrateEnvironment,
  recoverEnvironment,
  restoreEnvironment,
  runProjectionMaintenance,
  verifyBackup,
} from '@motorcove/database/maintenance';
import { environmentPaths } from '@motorcove/database/environment';
import { databaseFixture, hashes } from '../helpers/database.js';
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
describe('backup, restore, recovery', () => {
  it('rejects a standard backup while bootstrap owns the environment lifecycle', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const ownership = await acquireBootstrapOwnership(paths);
    const entriesBefore = readdirSync(paths.backupsDir).sort();
    try {
      await expect(backupEnvironment(paths)).rejects.toThrow('RESOURCE_BUSY');
    } finally {
      await ownership.release();
    }
    expect(readdirSync(paths.backupsDir).sort()).toEqual(entriesBefore);
  });

  it('rejects a deployed bootstrap snapshot whose journal has no completion receipt', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    writeFileSync(paths.seedJournalPath, '{"state":"incomplete"}\n');

    await expect(backupEnvironment(paths)).rejects.toThrow(
      'BACKUP_INVALID: bootstrap lifecycle incomplete',
    );
    expect(readdirSync(paths.backupsDir)).toHaveLength(0);
  });

  it('rejects a legacy backup whose recorded bootstrap sidecars are incomplete', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    writeFileSync(paths.seedJournalPath, '{"state":"verified"}\n');
    writeFileSync(paths.bootstrapReceiptPath, '{"generation":"a"}\n');
    const backup = await backupEnvironment(paths);
    unlinkSync(resolve(backup.path, 'bootstrap-receipt.json'));
    const manifestPath = resolve(backup.path, 'backup-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      sidecars: { bootstrapReceipt: { present: boolean; sha256?: string } };
    };
    manifest.sidecars.bootstrapReceipt = { present: false };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    expect(() => verifyBackup(paths, backup.backupId)).toThrow(
      'BACKUP_INVALID: bootstrap lifecycle incomplete',
    );
  });

  it('rejects restore when bootstrap sidecars advanced after the snapshot', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    writeFileSync(paths.seedJournalPath, '{"state":"verified"}\n');
    writeFileSync(paths.bootstrapReceiptPath, '{"generation":"a"}\n');
    const backup = await backupEnvironment(paths);
    writeFileSync(paths.bootstrapReceiptPath, '{"generation":"b"}\n');
    const entriesBefore = readdirSync(paths.environmentDir).sort();

    await expect(restoreEnvironment(paths, backup.backupId, true)).rejects.toThrow(
      'BACKUP_SIDECAR_MISMATCH: bootstrap-receipt.json',
    );

    expect(
      readdirSync(paths.environmentDir).filter((entry) => entry.startsWith('.quarantine-')),
    ).toHaveLength(0);
    expect(readdirSync(paths.environmentDir).sort()).toEqual(
      [...entriesBefore, 'maintenance.json'].sort(),
    );
  });

  it('rejects restore while bootstrap owns the environment lifecycle', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const backup = await backupEnvironment(paths);
    const ownership = await acquireBootstrapOwnership(paths);
    try {
      await expect(restoreEnvironment(paths, backup.backupId, true)).rejects.toThrow(
        'RESOURCE_BUSY',
      );
    } finally {
      await ownership.release();
    }
    expect(existsSync(paths.maintenancePath)).toBe(false);
    expect(
      readdirSync(paths.environmentDir).some((entry) => entry.startsWith('.quarantine-')),
    ).toBe(false);
  });

  it('rejects predeployment backup when any deployment lifecycle sidecar exists', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'motorcove-predeployment-sidecar-'));
    roots.push(root);
    const paths = environmentPaths(root, 'predeployment-sidecar');
    await migrateEnvironment(paths);
    writeFileSync(paths.deploymentPath, `${JSON.stringify({ deploymentId: hashes.deployment })}\n`);

    await expect(backupEnvironment(paths)).rejects.toThrow(
      'BACKUP_INVALID: predeployment sidecar state',
    );
    expect(readdirSync(paths.backupsDir)).toHaveLength(0);
  });

  it('rejects predeployment restore before replacing the active database', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'motorcove-predeployment-restore-'));
    roots.push(root);
    const paths = environmentPaths(root, 'predeployment-restore');
    await migrateEnvironment(paths);
    const backup = await backupEnvironment(paths);
    const activeBefore = readFileSync(paths.databasePath);

    await expect(restoreEnvironment(paths, backup.backupId, true)).rejects.toThrow(
      'BACKUP_PREDEPLOYMENT_RESTORE_UNSUPPORTED',
    );
    expect(readFileSync(paths.databasePath)).toEqual(activeBefore);
    expect(
      readdirSync(paths.environmentDir).some((entry) => entry.startsWith('.quarantine-')),
    ).toBe(false);
  });

  it('DB-47 snapshots committed WAL data into a standalone database', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const writer = new Database(paths.databasePath);
    writer.pragma('journal_mode = WAL');
    writer
      .prepare(
        `INSERT INTO catalog_vehicles VALUES ('wal','WAL row','committed','M','2026','/wal.svg','MANUAL',NULL,NULL,'x','x')`,
      )
      .run();
    const backup = await backupEnvironment(paths);
    expect(backup.manifest).toMatchObject({
      migrationCount: backup.verification.historyCount,
      migrationBundleDigest: backup.verification.migrationBundleDigest,
      schemaFingerprint: backup.verification.fingerprint,
      schemaContractVersion: backup.verification.contractVersion,
    });
    writer.close();
    const snapshot = new Database(resolve(backup.path, 'database.sqlite'), {
      readonly: true,
      fileMustExist: true,
    });
    expect(
      snapshot.prepare(`SELECT name FROM catalog_vehicles WHERE catalog_id='wal'`).get(),
    ).toEqual({ name: 'WAL row' });
    snapshot.close();
  });
  it('DB-48 rejects a corrupted backup without changing active data', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const backup = await backupEnvironment(paths);
    writeFileSync(resolve(backup.path, 'database.sqlite'), 'corrupt');
    await expect(restoreEnvironment(paths, backup.backupId, true)).rejects.toThrow(
      'BACKUP_INVALID',
    );
    const active = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
    expect(active.pragma('integrity_check', { simple: true })).toBe('ok');
    active.close();
  });

  it('DB-69 refuses a standard backup while an incomplete maintenance marker exists', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    await expect(
      runProjectionMaintenance(paths, {
        operationType: 'REINDEX_PROJECTION',
        expectedDeploymentId: hashes.deployment,
        recovery: {
          reindexFromBlock: '1',
          targetBlock: '1',
          targetHash: hashes.block,
        },
        run: () => {
          throw new Error('controlled incomplete reindex');
        },
      }),
    ).rejects.toThrow('controlled incomplete reindex');
    const markerBefore = readFileSync(paths.maintenancePath, 'utf8');
    const backupsBefore = readdirSync(paths.backupsDir).sort();

    await expect(backupEnvironment(paths)).rejects.toThrow('MAINTENANCE_INCOMPLETE');

    expect(readFileSync(paths.maintenancePath, 'utf8')).toBe(markerBefore);
    expect(readdirSync(paths.backupsDir).sort()).toEqual(backupsBefore);
  });

  it('DB-70 preserves maintenance source evidence and refuses normal restore of that archive', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const options = {
      operationType: 'REINDEX_PROJECTION' as const,
      expectedDeploymentId: hashes.deployment,
      recovery: {
        reindexFromBlock: '1',
        targetBlock: '1',
        targetHash: hashes.block,
      },
    };
    let backupId: string | undefined;
    await expect(
      runProjectionMaintenance(paths, {
        ...options,
        run: async (_database, maintenance) => {
          const backup = await backupEnvironment(paths, {
            locksAlreadyHeld: true,
            reason: 'test-incomplete-reindex-evidence',
            maintenance: {
              operationId: maintenance.marker.operationId,
              purpose: 'SOURCE_REFRESH_ARCHIVE',
            },
          });
          backupId = backup.backupId;
          throw new Error('controlled failure after evidence snapshot');
        },
      }),
    ).rejects.toThrow('controlled failure after evidence snapshot');
    expect(backupId).toBeDefined();
    const verified = verifyBackup(paths, backupId!);
    expect(verified.manifest).toMatchObject({
      formatVersion: 3,
      restorePolicy: 'EVIDENCE_ONLY',
      sourceCondition: {
        state: 'MAINTENANCE_INCOMPLETE',
        operationType: 'REINDEX_PROJECTION',
        stage: 'ACTIVE',
        purpose: 'SOURCE_REFRESH_ARCHIVE',
      },
      projectionEvidence: {
        state: 'OBSERVED',
        deploymentId: hashes.deployment,
        checkpointBlock: '1',
        projectionStatus: 'CURRENT',
      },
    });
    const manifestPath = resolve(verified.directory, 'backup-manifest.json');
    const manifestBytes = readFileSync(manifestPath, 'utf8');
    const tampered = JSON.parse(manifestBytes) as {
      projectionEvidence: { checkpointBlock: string };
    };
    tampered.projectionEvidence.checkpointBlock = '999';
    writeFileSync(manifestPath, `${JSON.stringify(tampered, null, 2)}\n`);
    expect(() => verifyBackup(paths, backupId!)).toThrow('BACKUP_INVALID: projection evidence');
    writeFileSync(manifestPath, manifestBytes, { flush: true });

    await runProjectionMaintenance(paths, { ...options, run: () => undefined });
    const beforeEntries = readdirSync(paths.environmentDir).sort();
    await expect(restoreEnvironment(paths, backupId!, true)).rejects.toThrow(
      'BACKUP_NOT_RESTORABLE: incomplete maintenance evidence',
    );
    expect(
      readdirSync(paths.environmentDir).filter((entry) => entry.startsWith('.quarantine-')),
    ).toHaveLength(0);
    expect(readdirSync(paths.environmentDir).sort()).toEqual(
      [...beforeEntries, 'maintenance.json'].sort(),
    );
  });

  it('keeps a deployed database without Indexer rows eligible for a standard backup', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const database = new Database(paths.databasePath);
    database.prepare('DELETE FROM indexer_runtime_status').run();
    database.prepare('DELETE FROM indexer_checkpoint').run();
    database.close();

    const backup = await backupEnvironment(paths);

    expect(backup.manifest).toMatchObject({
      restorePolicy: 'STANDARD',
      sourceCondition: { state: 'READY' },
      projectionEvidence: { state: 'NOT_INITIALIZED', deploymentId: hashes.deployment },
    });
    expect(() => verifyBackup(paths, backup.backupId)).not.toThrow();
  });
  it.each(['MIGRATE', 'RESTORE', 'REINDEX_PROJECTION'] as const)(
    'preserves an existing %s marker byte-for-byte when restore is rejected',
    async (operationType) => {
      const { root, paths } = await databaseFixture();
      roots.push(root);
      const original = `${JSON.stringify({
        operationId: `original-${operationType.toLowerCase()}`,
        operationType,
        stage: 'FAILED',
        environmentId: paths.environmentId,
        targetDatabase: paths.databasePath,
        expectedSchemaContract: '1',
        startedAt: '2026-09-21T00:00:00.000Z',
      })}\n`;
      writeFileSync(paths.maintenancePath, original);
      const beforeEntries = readdirSync(paths.environmentDir).sort();

      await expect(
        restoreEnvironment(paths, '2026-09-21T00-00-00-000Z-deadbeef', true),
      ).rejects.toThrow('MAINTENANCE_INCOMPLETE');

      expect(readFileSync(paths.maintenancePath, 'utf8')).toBe(original);
      expect(readdirSync(paths.environmentDir).sort()).toEqual(beforeEntries);
      const active = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
      expect(active.pragma('integrity_check', { simple: true })).toBe('ok');
      active.close();
    },
  );

  it('restores a verified snapshot while quarantining the current database', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const before = new Database(paths.databasePath);
    before
      .prepare(
        `INSERT INTO catalog_vehicles VALUES ('kept','Before','snapshot','M','2026','/before.svg','MANUAL',NULL,NULL,'x','x')`,
      )
      .run();
    before.close();
    const backup = await backupEnvironment(paths);
    const changed = new Database(paths.databasePath);
    changed.prepare(`UPDATE catalog_vehicles SET name='After' WHERE catalog_id='kept'`).run();
    changed.close();
    const result = await restoreEnvironment(paths, backup.backupId, true);
    const restored = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
    expect(
      restored.prepare(`SELECT name FROM catalog_vehicles WHERE catalog_id='kept'`).get(),
    ).toEqual({ name: 'Before' });
    restored.close();
    expect(result.quarantine).toContain('.quarantine-');
  });

  it('rejects changed backup bytes after verification before quarantining the active database', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const original = new Database(paths.databasePath);
    original
      .prepare(
        `INSERT INTO catalog_vehicles VALUES ('toctou','BACKUP_A','snapshot','M','2026','/before.svg','MANUAL',NULL,NULL,'x','x')`,
      )
      .run();
    original.close();
    const backup = await backupEnvironment(paths);
    const active = new Database(paths.databasePath);
    active.prepare(`UPDATE catalog_vehicles SET name='ACTIVE' WHERE catalog_id='toctou'`).run();
    active.close();
    const replacement = resolve(root, 'replacement.sqlite');
    copyFileSync(resolve(backup.path, 'database.sqlite'), replacement);
    const changedBackup = new Database(replacement);
    changedBackup
      .prepare(`UPDATE catalog_vehicles SET name='BACKUP_B' WHERE catalog_id='toctou'`)
      .run();
    changedBackup.close();

    await expect(
      restoreEnvironment(paths, backup.backupId, true, {
        copyDatabase: (source, destination) => {
          copyFileSync(replacement, source);
          copyFileSync(source, destination);
        },
      }),
    ).rejects.toThrow('BACKUP_INVALID: staging checksum');

    const preserved = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
    expect(
      preserved.prepare(`SELECT name FROM catalog_vehicles WHERE catalog_id='toctou'`).get(),
    ).toEqual({ name: 'ACTIVE' });
    preserved.close();
    expect(
      readdirSync(paths.environmentDir).some((entry) => entry.startsWith('.quarantine-')),
    ).toBe(false);
  });

  it('rejects a backup from a different deployment before quarantining the active database', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    writeFileSync(paths.deploymentPath, `${JSON.stringify({ deploymentId: hashes.deployment })}\n`);
    const backup = await backupEnvironment(paths);
    const otherDeployment = `0x${'f'.repeat(64)}`;
    const current = new Database(paths.databasePath);
    current.pragma('foreign_keys = OFF');
    current.prepare('UPDATE indexer_checkpoint SET deployment_id=?').run(otherDeployment);
    current.prepare('UPDATE indexer_runtime_status SET deployment_id=?').run(otherDeployment);
    current.prepare('UPDATE deployments SET deployment_id=?').run(otherDeployment);
    current.close();
    writeFileSync(paths.deploymentPath, `${JSON.stringify({ deploymentId: otherDeployment })}\n`);

    await expect(restoreEnvironment(paths, backup.backupId, true)).rejects.toThrow(
      'BACKUP_DEPLOYMENT_MISMATCH',
    );
    const active = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
    expect(active.prepare('SELECT deployment_id AS deploymentId FROM deployments').get()).toEqual({
      deploymentId: otherDeployment,
    });
    active.close();
    expect(
      readdirSync(paths.environmentDir).some((entry) => entry.startsWith('.quarantine-')),
    ).toBe(false);
  });

  it('rejects a backup whose deployment sidecar changed after backup creation', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    writeFileSync(paths.deploymentPath, `${JSON.stringify({ deploymentId: hashes.deployment })}\n`);
    const backup = await backupEnvironment(paths);
    writeFileSync(
      resolve(backup.path, 'deployment.json'),
      `${JSON.stringify({ deploymentId: `0x${'f'.repeat(64)}` })}\n`,
    );

    await expect(restoreEnvironment(paths, backup.backupId, true)).rejects.toThrow(
      'BACKUP_INVALID: sidecar',
    );
  });

  it('rejects a backup whose recorded deployment sidecar is missing', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    writeFileSync(paths.deploymentPath, `${JSON.stringify({ deploymentId: hashes.deployment })}\n`);
    const backup = await backupEnvironment(paths);
    rmSync(resolve(backup.path, 'deployment.json'));

    await expect(restoreEnvironment(paths, backup.backupId, true)).rejects.toThrow(
      'BACKUP_INVALID: sidecar deployment.json',
    );
  });

  it('refuses to create a backup without the deployment sidecar', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    unlinkSync(paths.deploymentPath);

    await expect(backupEnvironment(paths)).rejects.toThrow(
      'BACKUP_INVALID: deployment sidecar required',
    );
  });

  it('refuses to create a backup when the deployment sidecar disagrees with the database', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    writeFileSync(
      paths.deploymentPath,
      `${JSON.stringify({ deploymentId: `0x${'f'.repeat(64)}` })}\n`,
    );

    await expect(backupEnvironment(paths)).rejects.toThrow('BACKUP_INVALID: deployment identity');
  });

  it('rejects restore when the active deployment manifest is missing before quarantine', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const backup = await backupEnvironment(paths);
    unlinkSync(paths.deploymentPath);

    await expect(restoreEnvironment(paths, backup.backupId, true)).rejects.toThrow(
      'ACTIVE_DEPLOYMENT_MANIFEST_MISSING',
    );
    expect(
      readdirSync(paths.environmentDir).some((entry) => entry.startsWith('.quarantine-')),
    ).toBe(false);
  });
  it('DB-50 recovers a restore crash from quarantine without mixing sidecars', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const operationId = 'restore-crash';
    const quarantine = resolve(paths.environmentDir, `.quarantine-${operationId}`);
    const { mkdirSync, renameSync } = await import('node:fs');
    mkdirSync(quarantine);
    renameSync(paths.databasePath, resolve(quarantine, 'motorcove.sqlite'));
    writeFileSync(
      paths.maintenancePath,
      JSON.stringify({
        operationId,
        operationType: 'RESTORE',
        stage: 'ACTIVE_QUARANTINED',
        environmentId: 'test',
        targetDatabase: paths.databasePath,
        expectedSchemaContract: '1',
        startedAt: new Date(0).toISOString(),
      }),
    );
    expect((await recoverEnvironment(paths, true)).status).toBe('RECOVERED');
    const db = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    db.close();
  });

  it('recovers a staged snapshot without attaching the previous active WAL generation', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const original = new Database(paths.databasePath);
    original
      .prepare(
        `INSERT INTO catalog_vehicles VALUES
          ('kept','BACKUP_VALUE','snapshot','M','2026','/before.svg','MANUAL',NULL,NULL,'x','x')`,
      )
      .run();
    original.close();
    const backup = await backupEnvironment(paths);

    const ready = resolve(root, 'hot-wal-ready');
    const helper = resolve(import.meta.dirname, '../helpers/hot-wal-writer-child.ts');
    const writer = spawn(process.execPath, ['--import', 'tsx', helper, paths.databasePath, ready], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    for (let attempt = 0; attempt < 100 && !existsSync(ready); attempt += 1) await wait(20);
    expect(readFileSync(ready, 'utf8')).toBe('ready\n');
    writer.kill('SIGKILL');
    await new Promise<void>((resolveExit, reject) => {
      writer.once('error', reject);
      writer.once('exit', () => resolveExit());
    });
    expect(statSync(`${paths.databasePath}-wal`).size).toBeGreaterThan(0);

    const operationId = 'restore-hot-wal-crash';
    const staging = resolve(paths.environmentDir, `.restore-${operationId}`);
    const quarantine = resolve(paths.environmentDir, `.quarantine-${operationId}`);
    mkdirSync(staging);
    mkdirSync(quarantine);
    copyFileSync(resolve(backup.path, 'database.sqlite'), resolve(staging, 'motorcove.sqlite'));
    renameSync(paths.databasePath, resolve(quarantine, 'motorcove.sqlite'));
    writeFileSync(
      paths.maintenancePath,
      `${JSON.stringify({
        operationId,
        operationType: 'RESTORE',
        stage: 'ACTIVE_QUARANTINED',
        environmentId: paths.environmentId,
        targetDatabase: paths.databasePath,
        expectedSchemaContract: '1',
        backupId: backup.backupId,
        startedAt: new Date(0).toISOString(),
      })}\n`,
    );

    await expect(recoverEnvironment(paths, true)).resolves.toMatchObject({
      status: 'RECOVERED',
      operationId,
    });
    const recovered = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
    expect(
      recovered.prepare("SELECT name FROM catalog_vehicles WHERE catalog_id='kept'").get(),
    ).toEqual({ name: 'BACKUP_VALUE' });
    expect(recovered.pragma('integrity_check', { simple: true })).toBe('ok');
    recovered.close();
    expect(existsSync(resolve(quarantine, 'motorcove.sqlite-wal'))).toBe(true);
  });
});
