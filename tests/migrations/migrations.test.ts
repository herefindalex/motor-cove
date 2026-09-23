import Database from 'better-sqlite3';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  acquireBootstrapOwnership,
  environmentPaths,
  initializeOwnedEnvironment,
  inspectEnvironment,
  migrateEnvironment,
  recoverEnvironment,
  schemaFingerprint,
  verifyDatabase,
  schemaSourceDigest,
  loadSchemaContract,
  migrationBundle,
  migrationBundleDigest,
  readNativeHistory,
  verifyKnownSourceDatabase,
  verifyBackup,
} from '@motorcove/database/maintenance';
import { databaseFixture, hashes } from '../helpers/database.js';
const roots: string[] = [];

function downgradeToPriorMigration(db: Database.Database): void {
  const prior = new Database(':memory:');
  for (const name of [
    '0000_initial.sql',
    '0001_source-record-integrity.sql',
    '0002_reconciliation_sequence.sql',
  ]) {
    prior.exec(
      readFileSync(join(import.meta.dirname, '../../packages/database/drizzle', name), 'utf8'),
    );
  }
  db.pragma('foreign_keys = OFF');
  for (const table of ['sales', 'indexer_runtime_status']) {
    const row = prior
      .prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?")
      .get(table) as { sql: string };
    const columns = (prior.pragma(`table_info(${table})`) as Array<{ name: string }>)
      .map(({ name }) => `"${name}"`)
      .join(',');
    db.exec(`CREATE TEMP TABLE __prior_rows AS SELECT ${columns} FROM ${table}`);
    db.exec(`DROP TABLE ${table}`);
    db.exec(row.sql);
    db.exec(`INSERT INTO ${table}(${columns}) SELECT ${columns} FROM __prior_rows`);
    db.exec('DROP TABLE __prior_rows');
    for (const index of prior
      .prepare(
        "SELECT sql FROM sqlite_schema WHERE type='index' AND tbl_name=? AND sql IS NOT NULL",
      )
      .all(table) as Array<{ sql: string }>) {
      db.exec(index.sql);
    }
  }
  prior.close();
  db.prepare(
    'DELETE FROM __drizzle_migrations WHERE created_at=(SELECT MAX(created_at) FROM __drizzle_migrations)',
  ).run();
  db.prepare(
    'UPDATE db_contract SET migration_bundle_digest=?,schema_fingerprint=? WHERE id=1',
  ).run(migrationBundleDigest(migrationBundle().slice(0, 3)), schemaFingerprint(db));
  db.pragma('foreign_keys = ON');
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function removeReconciliationSequence(db: Database.Database): void {
  db.exec(`
    PRAGMA foreign_keys=OFF;
    CREATE TABLE __prior_reconciliation_runs (
      id TEXT PRIMARY KEY NOT NULL,
      deployment_id TEXT NOT NULL,
      comparison TEXT NOT NULL,
      freshness TEXT NOT NULL,
      block_number INTEGER,
      block_hash TEXT,
      projector_version TEXT NOT NULL,
      projection_build_id TEXT NOT NULL,
      log_scope_hash TEXT NOT NULL,
      scope_json TEXT NOT NULL,
      differences_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (deployment_id) REFERENCES deployments(deployment_id) ON UPDATE no action ON DELETE no action,
      CONSTRAINT reconciliation_comparison_check CHECK(comparison IN ('MATCH','MISMATCH','UNVERIFIABLE')),
      CONSTRAINT reconciliation_freshness_check CHECK(freshness IN ('CURRENT','PROJECTION_LAGGING','HEAD_UNKNOWN'))
    );
    INSERT INTO __prior_reconciliation_runs
      (id,deployment_id,comparison,freshness,block_number,block_hash,projector_version,
       projection_build_id,log_scope_hash,scope_json,differences_json,created_at)
    SELECT id,deployment_id,comparison,freshness,block_number,block_hash,projector_version,
           projection_build_id,log_scope_hash,scope_json,differences_json,created_at
    FROM reconciliation_runs ORDER BY rowid;
    DROP TABLE reconciliation_runs;
    ALTER TABLE __prior_reconciliation_runs RENAME TO reconciliation_runs;
    PRAGMA foreign_keys=ON;
  `);
  db.prepare(
    'DELETE FROM __drizzle_migrations WHERE created_at=(SELECT MAX(created_at) FROM __drizzle_migrations)',
  ).run();
}

function downgradeToFirstMigration(databasePath: string): void {
  const db = new Database(databasePath);
  downgradeToPriorMigration(db);
  removeReconciliationSequence(db);
  db.exec('ALTER TABLE chain_events DROP COLUMN source_record_digest');
  db.prepare(
    'DELETE FROM __drizzle_migrations WHERE created_at=(SELECT MAX(created_at) FROM __drizzle_migrations)',
  ).run();
  db.prepare(
    'UPDATE db_contract SET migration_bundle_digest=?,schema_fingerprint=? WHERE id=1',
  ).run(migrationBundleDigest(migrationBundle().slice(0, 1)), schemaFingerprint(db));
  db.close();
}

describe('native migration path', () => {
  it('DB-01/02 creates a fresh database and reruns as a no-op', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const db = new Database(paths.databasePath);
    db.prepare(
      `INSERT INTO catalog_vehicles VALUES ('manual','Manual','kept','M','2026','/m.svg','MANUAL',NULL,NULL,'x','x')`,
    ).run();
    const before = (
      db.prepare('SELECT count(*) count FROM __drizzle_migrations').get() as { count: number }
    ).count;
    db.close();
    const result = await migrateEnvironment(paths);
    expect(result.changed).toBe(false);
    const after = new Database(paths.databasePath);
    expect(
      (after.prepare('SELECT count(*) count FROM __drizzle_migrations').get() as { count: number })
        .count,
    ).toBe(before);
    expect(
      after.prepare(`SELECT name FROM catalog_vehicles WHERE catalog_id='manual'`).get(),
    ).toEqual({ name: 'Manual' });
    after.close();
  });

  it('upgrades the prior schema without changing existing chain event data', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const db = new Database(paths.databasePath);
    const decoded = JSON.stringify({
      kind: 'SaleCancelled',
      saleId: '7',
    });
    db.prepare(
      `INSERT INTO chain_events(
        deployment_id,block_hash,log_index,block_number,tx_hash,transaction_index,
        contract_address,topics_json,data,raw_envelope_digest,decoded_json,decoder_version,
        source_record_digest,first_seen_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      `0x${'1'.repeat(64)}`,
      `0x${'2'.repeat(64)}`,
      0,
      7,
      `0x${'4'.repeat(64)}`,
      0,
      `0x${'9'.repeat(40)}`,
      '[]',
      '0x',
      `0x${'a'.repeat(64)}`,
      decoded,
      'motorcove-events-v1',
      null,
      '2026-09-21T00:00:00.000Z',
    );
    downgradeToPriorMigration(db);
    removeReconciliationSequence(db);
    db.exec('ALTER TABLE chain_events DROP COLUMN source_record_digest');
    db.prepare(
      'DELETE FROM __drizzle_migrations WHERE created_at=(SELECT MAX(created_at) FROM __drizzle_migrations)',
    ).run();
    db.prepare(
      'UPDATE db_contract SET migration_bundle_digest=?,schema_fingerprint=? WHERE id=1',
    ).run(migrationBundleDigest(migrationBundle().slice(0, 1)), schemaFingerprint(db));
    db.close();

    const result = await migrateEnvironment(paths);

    expect(result.changed).toBe(true);
    const upgraded = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
    expect(
      upgraded
        .prepare(
          'SELECT decoded_json AS decodedJson,source_record_digest AS sourceRecordDigest FROM chain_events',
        )
        .get(),
    ).toEqual({ decodedJson: decoded, sourceRecordDigest: null });
    expect(
      (
        upgraded.prepare('SELECT COUNT(*) AS count FROM __drizzle_migrations').get() as {
          count: number;
        }
      ).count,
    ).toBe(4);
    upgraded.close();
  });

  it('backfills reconciliation sequence by legacy physical order without rewriting timestamps', async () => {
    const { root, paths } = await databaseFixture('r27-sequence-backfill');
    roots.push(root);
    const db = new Database(paths.databasePath);
    downgradeToPriorMigration(db);
    removeReconciliationSequence(db);
    db.prepare(
      'UPDATE db_contract SET migration_bundle_digest=?,schema_fingerprint=? WHERE id=1',
    ).run(migrationBundleDigest(migrationBundle().slice(0, 2)), schemaFingerprint(db));
    const insert = db.prepare(`
      INSERT INTO reconciliation_runs(
        id,deployment_id,comparison,freshness,block_number,block_hash,projector_version,
        projection_build_id,log_scope_hash,scope_json,differences_json,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const common = [
      hashes.deployment,
      'CURRENT',
      1,
      hashes.block,
      '1',
      'build-test',
      hashes.scope,
      '{}',
      '[]',
    ] as const;
    insert.run('first', common[0], 'MATCH', ...common.slice(1), '2026-09-23T12:00:00.000Z');
    insert.run('second', common[0], 'MISMATCH', ...common.slice(1), '2026-09-23T11:59:00.000Z');
    db.close();

    await expect(migrateEnvironment(paths)).resolves.toMatchObject({ changed: true });
    const upgraded = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
    expect(
      upgraded
        .prepare(
          'SELECT id,run_sequence AS runSequence,created_at AS createdAt FROM reconciliation_runs ORDER BY run_sequence',
        )
        .all(),
    ).toEqual([
      { id: 'first', runSequence: 1, createdAt: '2026-09-23T12:00:00.000Z' },
      { id: 'second', runSequence: 2, createdAt: '2026-09-23T11:59:00.000Z' },
    ]);
    upgraded.close();
  });

  it('DB-63 retries a failed pre-migration backup before applying any SQL', async () => {
    const { root, paths } = await databaseFixture('backup-retry');
    roots.push(root);
    downgradeToFirstMigration(paths.databasePath);
    unlinkSync(paths.deploymentPath);

    await expect(migrateEnvironment(paths)).rejects.toThrow(
      'BACKUP_INVALID: deployment sidecar required',
    );
    await expect(migrateEnvironment(paths)).rejects.toThrow(
      'BACKUP_INVALID: deployment sidecar required',
    );

    expect(readdirSync(paths.backupsDir)).toEqual([]);
    const marker = JSON.parse(readFileSync(paths.maintenancePath, 'utf8')) as {
      stage: string;
      backupId?: string;
    };
    expect(marker).toMatchObject({ stage: 'FAILED' });
    expect(marker.backupId).toBeUndefined();
    const db = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
    expect(readNativeHistory(db)).toHaveLength(1);
    expect(
      db
        .prepare(
          "SELECT 1 FROM pragma_table_info('chain_events') WHERE name='source_record_digest'",
        )
        .get(),
    ).toBeUndefined();
    db.close();
  });

  it('DB-64 revalidates and reuses a completed backup when migration SQL resumes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-backup-proof-'));
    roots.push(root);
    const paths = environmentPaths(root, 'backup-proof');
    await migrateEnvironment(paths);
    downgradeToFirstMigration(paths.databasePath);

    await expect(
      migrateEnvironment(paths, {
        applyMigrations: () => {
          throw new Error('CONTROLLED_AFTER_BACKUP');
        },
      }),
    ).rejects.toThrow('CONTROLLED_AFTER_BACKUP');

    const failed = JSON.parse(readFileSync(paths.maintenancePath, 'utf8')) as {
      stage: string;
      backupId?: string;
    };
    expect(failed.stage).toBe('FAILED');
    expect(failed.backupId).toBe(readdirSync(paths.backupsDir)[0]);
    expect(readdirSync(paths.backupsDir)).toHaveLength(1);

    await expect(migrateEnvironment(paths)).resolves.toMatchObject({ changed: true });
    expect(readdirSync(paths.backupsDir)).toHaveLength(1);
    expect(existsSync(paths.maintenancePath)).toBe(false);
  });

  it('creates the migration safety backup while bootstrap ownership is already held', async () => {
    const { root, paths } = await databaseFixture('bootstrap-owned-migration');
    roots.push(root);
    downgradeToFirstMigration(paths.databasePath);
    const ownership = await acquireBootstrapOwnership(paths);
    try {
      await expect(
        migrateEnvironment(paths, { bootstrapOwnershipAlreadyHeld: true }),
      ).resolves.toMatchObject({ changed: true });
    } finally {
      await ownership.release();
    }
    expect(readdirSync(paths.backupsDir)).toHaveLength(1);
    expect(existsSync(paths.maintenancePath)).toBe(false);
  });

  it('DB-64 rejects a recorded backup whose verified source evidence changed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-backup-proof-tamper-'));
    roots.push(root);
    const paths = environmentPaths(root, 'backup-proof-tamper');
    await migrateEnvironment(paths);
    downgradeToFirstMigration(paths.databasePath);

    await expect(
      migrateEnvironment(paths, {
        applyMigrations: () => {
          throw new Error('CONTROLLED_AFTER_BACKUP');
        },
      }),
    ).rejects.toThrow('CONTROLLED_AFTER_BACKUP');

    const marker = JSON.parse(readFileSync(paths.maintenancePath, 'utf8')) as {
      backupId: string;
    };
    const manifestPath = join(paths.backupsDir, marker.backupId, 'backup-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(
      manifestPath,
      `${JSON.stringify({ ...manifest, schemaFingerprint: 'tampered' }, null, 2)}\n`,
    );
    let applyCalls = 0;

    await expect(
      migrateEnvironment(paths, {
        applyMigrations: () => {
          applyCalls += 1;
        },
      }),
    ).rejects.toThrow('BACKUP_INVALID: source schema evidence');
    expect(applyCalls).toBe(0);
    const source = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
    expect(readNativeHistory(source)).toHaveLength(1);
    source.close();
  });

  it('DB-64 rejects a recorded backup after the live source identity changes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-backup-source-change-'));
    roots.push(root);
    const paths = environmentPaths(root, 'backup-source-change');
    await migrateEnvironment(paths);
    downgradeToFirstMigration(paths.databasePath);

    await expect(
      migrateEnvironment(paths, {
        applyMigrations: () => {
          throw new Error('CONTROLLED_AFTER_BACKUP');
        },
      }),
    ).rejects.toThrow('CONTROLLED_AFTER_BACKUP');

    const source = new Database(paths.databasePath);
    source.prepare("UPDATE db_contract SET contract_version='different-source' WHERE id=1").run();
    source.close();
    let applyCalls = 0;

    await expect(
      migrateEnvironment(paths, {
        applyMigrations: () => {
          applyCalls += 1;
        },
      }),
    ).rejects.toThrow('MIGRATION_BACKUP_INVALID: source identity');
    expect(applyCalls).toBe(0);
    expect(readdirSync(paths.backupsDir)).toHaveLength(1);
  });

  it('DB-65 rejects unowned environment state before creating owner metadata', async () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-unowned-state-'));
    roots.push(root);
    const paths = environmentPaths(root, 'unowned-state');
    mkdirSync(paths.databaseDir, { recursive: true });
    const original = Buffer.from('existing-unowned-database');
    writeFileSync(paths.databasePath, original);

    expect(() => initializeOwnedEnvironment(paths)).toThrow(
      'DB_NOT_OWNED: existing environment state',
    );
    expect(readFileSync(paths.databasePath)).toEqual(original);
    expect(existsSync(paths.ownerPath)).toBe(false);
    await expect(migrateEnvironment(paths)).rejects.toThrow(
      'DB_NOT_OWNED: existing environment state',
    );
    expect(readFileSync(paths.databasePath)).toEqual(original);
    expect(existsSync(paths.ownerPath)).toBe(false);
  });

  it.each([
    'deploymentPath',
    'bootstrapReceiptPath',
    'seedJournalPath',
    'maintenancePath',
    'nodeBindingPath',
  ] as const)('DB-66 rejects an unowned %s sidecar without changing it', (pathKey) => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-unowned-sidecar-'));
    roots.push(root);
    const paths = environmentPaths(root, `unowned-${pathKey.toLowerCase()}`);
    mkdirSync(paths.environmentDir, { recursive: true });
    const original = Buffer.from(`preserve-${pathKey}`);
    writeFileSync(paths[pathKey], original);

    expect(() => initializeOwnedEnvironment(paths)).toThrow(
      'DB_NOT_OWNED: existing environment state',
    );
    expect(readFileSync(paths[pathKey])).toEqual(original);
    expect(existsSync(paths.ownerPath)).toBe(false);
  });

  it('DB-67 initializes a genuinely empty environment and remains idempotent', () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-fresh-owner-'));
    roots.push(root);
    const paths = environmentPaths(root, 'fresh-owner');
    mkdirSync(paths.databaseDir, { recursive: true });
    mkdirSync(paths.reportsDir, { recursive: true });

    initializeOwnedEnvironment(paths);
    const owner = readFileSync(paths.ownerPath);
    expect(existsSync(paths.databasePath)).toBe(false);
    initializeOwnedEnvironment(paths);
    expect(readFileSync(paths.ownerPath)).toEqual(owner);
    expect(existsSync(paths.databasePath)).toBe(false);
  });
  it('backs up and upgrades a verified predeployment schema without inventing chain identity', async () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-predeployment-migration-'));
    roots.push(root);
    const paths = environmentPaths(root, 'predeployment-migration');
    await migrateEnvironment(paths);
    const db = new Database(paths.databasePath);
    db.prepare(
      `INSERT INTO catalog_vehicles VALUES ('predeploy','Predeploy','kept','M','2026','/p.svg','MANUAL',NULL,NULL,'x','x')`,
    ).run();
    downgradeToPriorMigration(db);
    removeReconciliationSequence(db);
    db.exec('ALTER TABLE chain_events DROP COLUMN source_record_digest');
    db.prepare(
      'DELETE FROM __drizzle_migrations WHERE created_at=(SELECT MAX(created_at) FROM __drizzle_migrations)',
    ).run();
    db.prepare(
      'UPDATE db_contract SET migration_bundle_digest=?,schema_fingerprint=? WHERE id=1',
    ).run(migrationBundleDigest(migrationBundle().slice(0, 1)), schemaFingerprint(db));
    db.close();

    await expect(migrateEnvironment(paths)).resolves.toMatchObject({ changed: true });
    const backupIds = readdirSync(paths.backupsDir);
    expect(backupIds).toHaveLength(1);
    const backup = verifyBackup(paths, backupIds[0]!);
    expect(backup.manifest).toMatchObject({
      deploymentState: 'PREDEPLOYMENT',
      deploymentId: null,
      sidecars: {
        deployment: { present: false },
        bootstrapReceipt: { present: false },
        seedJournal: { present: false },
      },
    });
    const upgraded = new Database(paths.databasePath);
    expect(
      upgraded.prepare("SELECT name FROM catalog_vehicles WHERE catalog_id='predeploy'").get(),
    ).toEqual({ name: 'Predeploy' });
    expect(
      (upgraded.prepare('SELECT count(*) AS count FROM deployments').get() as { count: number })
        .count,
    ).toBe(0);
    expect(() => verifyKnownSourceDatabase(upgraded)).not.toThrow();
    upgraded.close();
  });

  it('DB-05 rejects tampered native history', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const db = new Database(paths.databasePath);
    db.prepare(`UPDATE __drizzle_migrations SET hash='tampered'`).run();
    db.close();
    await expect(migrateEnvironment(paths)).rejects.toThrow('DB_HISTORY_DIVERGED');
    expect(existsSync(paths.maintenancePath)).toBe(true);
  });
  it('DB-04 rolls back injected migration SQL failure and retains a diagnostic marker', async () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-failing-migration-'));
    roots.push(root);
    const paths = environmentPaths(root, 'failing-migration');
    await expect(
      migrateEnvironment(paths, {
        applyMigrations: (db) =>
          db.transaction(() => {
            db.exec('CREATE TABLE injected_migration_partial(id INTEGER PRIMARY KEY)');
            db.exec('INSERT INTO table_that_does_not_exist VALUES (1)');
          })(),
      }),
    ).rejects.toThrow('table_that_does_not_exist');
    expect(existsSync(paths.maintenancePath)).toBe(true);
    const marker = JSON.parse(readFileSync(paths.maintenancePath, 'utf8')) as {
      stage: string;
      lastError: string;
    };
    expect(marker.stage).toBe('FAILED');
    expect(marker.lastError).toContain('table_that_does_not_exist');
    const db = new Database(paths.databasePath);
    expect(
      db.prepare("SELECT 1 FROM sqlite_schema WHERE name='injected_migration_partial'").get(),
    ).toBeUndefined();
    db.close();
  });
  it('resumes a failed migration only with the matching migration bundle identity', async () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-resumable-migration-'));
    roots.push(root);
    const paths = environmentPaths(root, 'resumable-migration');

    await expect(
      migrateEnvironment(paths, {
        applyMigrations: () => {
          throw new Error('CONTROLLED_MIGRATION_FAILURE');
        },
      }),
    ).rejects.toThrow('CONTROLLED_MIGRATION_FAILURE');

    const failedMarker = JSON.parse(readFileSync(paths.maintenancePath, 'utf8')) as {
      operationId: string;
      expectedMigrationBundleDigest: string;
    };
    expect(failedMarker.expectedMigrationBundleDigest).toBe(
      loadSchemaContract().migrationBundleDigest,
    );

    await expect(recoverEnvironment(paths, true)).resolves.toMatchObject({
      changed: false,
      status: 'ACTION_REQUIRED',
      action: 'RERUN_MATCHING_MIGRATION',
    });
    expect(existsSync(paths.maintenancePath)).toBe(true);

    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      paths.maintenancePath,
      JSON.stringify({ ...failedMarker, expectedMigrationBundleDigest: 'different-bundle' }),
    );
    await expect(migrateEnvironment(paths)).rejects.toThrow('MAINTENANCE_INCOMPLETE');
    writeFileSync(paths.maintenancePath, JSON.stringify(failedMarker));

    const resumed = await migrateEnvironment(paths);
    expect(resumed).toMatchObject({ operationId: failedMarker.operationId, changed: true });
    expect(existsSync(paths.maintenancePath)).toBe(false);
    const database = new Database(paths.databasePath);
    expect(() => verifyKnownSourceDatabase(database)).not.toThrow();
    database.close();
  });

  it('DB-05 rejects an unknown applied migration', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const db = new Database(paths.databasePath);
    db.prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES (?,?)').run(
      'unknown-migration',
      Date.now(),
    );
    db.close();
    await expect(migrateEnvironment(paths)).rejects.toThrow(
      'DB_HISTORY_DIVERGED: unknown migration',
    );
  });
  it('DB-06 binds the checked schema sources to the generated contract', () => {
    expect(schemaSourceDigest()).toBe(loadSchemaContract().schemaSourceDigest);
  });
  it('DB-07 detects live schema drift', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const db = new Database(paths.databasePath);
    db.exec('DROP INDEX sales_status');
    expect(() => verifyDatabase(db)).toThrow('DB_SCHEMA_DRIFT');
    db.close();
  });
  it('DB-08 fails fast for a schema behind the code contract', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const db = new Database(paths.databasePath);
    db.prepare('DELETE FROM __drizzle_migrations').run();
    expect(() => verifyDatabase(db)).toThrow('DB_HISTORY_DIVERGED');
    db.close();
  });
  it('accepts the current schema as a verified source prefix of a synthetic next bundle', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const current = migrationBundle();
    const syntheticNext = [
      ...current,
      {
        id: 'synthetic_next_migration',
        createdAt: current.at(-1)!.createdAt + 1,
        hash: 'synthetic-next-hash',
      },
    ];
    const db = new Database(paths.databasePath);
    const verification = verifyKnownSourceDatabase(db, syntheticNext);
    expect(verification).toMatchObject({
      historyCount: current.length,
      migrationBundleDigest: migrationBundleDigest(current),
    });
    expect(verification.migrationBundleDigest).not.toBe(migrationBundleDigest(syntheticNext));

    db.exec('DROP INDEX sales_status');
    expect(() => verifyKnownSourceDatabase(db, syntheticNext)).toThrow(
      'DB_SOURCE_CONTRACT_DRIFT: schema fingerprint',
    );
    db.close();
  });

  it('DB-09 completes a verified post-migration crash marker without rerunning migration', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const db = new Database(paths.databasePath);
    const before = (
      db.prepare('SELECT count(*) count FROM __drizzle_migrations').get() as { count: number }
    ).count;
    db.prepare(
      "UPDATE db_contract SET migration_bundle_digest='interrupted-finalization' WHERE id=1",
    ).run();
    db.close();
    await import('node:fs').then(({ writeFileSync }) =>
      writeFileSync(
        paths.maintenancePath,
        JSON.stringify({
          operationId: 'crash',
          operationType: 'MIGRATE',
          stage: 'VERIFYING',
          environmentId: 'test',
          targetDatabase: paths.databasePath,
          expectedSchemaContract: '1',
          expectedMigrationBundleDigest: loadSchemaContract().migrationBundleDigest,
          startedAt: new Date(0).toISOString(),
        }),
      ),
    );
    expect((await recoverEnvironment(paths, false)).status).toBe('RECOVERY_REQUIRED');
    expect((await recoverEnvironment(paths, true)).status).toBe('RECOVERED');
    const after = new Database(paths.databasePath);
    expect(
      (after.prepare('SELECT count(*) count FROM __drizzle_migrations').get() as { count: number })
        .count,
    ).toBe(before);
    expect(() => verifyKnownSourceDatabase(after)).not.toThrow();
    after.close();
  });
  it('status is read-only and does not create a missing environment', () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-missing-'));
    roots.push(root);
    const paths = environmentPaths(root, 'missing');
    expect(inspectEnvironment(paths).exists).toBe(false);
    expect(existsSync(paths.environmentDir)).toBe(false);
  });
});
