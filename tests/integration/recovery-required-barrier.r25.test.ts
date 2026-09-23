import Database from 'better-sqlite3';
import { existsSync, rmSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openProjectionWriter } from '@motorcove/database/projection-writer';
import {
  openReconciliationDatabase,
  runProjectionMaintenance,
} from '@motorcove/database/maintenance';
import { SqliteProjectionStore } from '../../apps/indexer/src/adapters/sqlite/sqlite-projection-store.js';
import type { BlockHeader } from '../../apps/indexer/src/ports/index.js';
import { databaseFixture, hashes } from '../helpers/database.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const block = (number: bigint): BlockHeader => ({
  number,
  hash: `0x${number.toString(16).padStart(64, '0')}`,
  parentHash: `0x${(number - 1n).toString(16).padStart(64, '0')}`,
  timestamp: 1_700_000_000n + number,
});

function readRuntime(db: Database.Database) {
  return db
    .prepare(
      `SELECT projection_status AS projectionStatus,recovery_reason AS recoveryReason
       FROM indexer_runtime_status WHERE deployment_id=?`,
    )
    .get(hashes.deployment) as {
    projectionStatus: string;
    recoveryReason: string | null;
  };
}

function forceRecovery(db: Database.Database, reason: string) {
  db.prepare(
    `UPDATE indexer_runtime_status
     SET projection_status='RECOVERY_REQUIRED',recovery_reason=?
     WHERE deployment_id=?`,
  ).run(reason, hashes.deployment);
}

describe('R25 RECOVERY_REQUIRED barrier', () => {
  it('does not allow markStale to downgrade confirmed integrity evidence', async () => {
    const { root, paths } = await databaseFixture('r25-stale-barrier');
    roots.push(root);
    const db = new Database(paths.databasePath);
    const store = SqliteProjectionStore.forMaintenance(
      db,
      hashes.deployment,
      hashes.address,
      hashes.scope,
    );

    forceRecovery(db, 'CHECKPOINT_HASH_CHANGED');
    await store.markStale('CHAIN_TRANSPORT_UNAVAILABLE');

    expect(readRuntime(db)).toEqual({
      projectionStatus: 'RECOVERY_REQUIRED',
      recoveryReason: 'CHECKPOINT_HASH_CHANGED',
    });
    db.close();
  });

  it('rejects an ordinary commit without moving the checkpoint or clearing recovery', async () => {
    const { root, paths } = await databaseFixture('r25-commit-barrier');
    roots.push(root);
    const db = new Database(paths.databasePath);
    const store = SqliteProjectionStore.forMaintenance(
      db,
      hashes.deployment,
      hashes.address,
      hashes.scope,
    );
    forceRecovery(db, 'CHECKPOINT_HASH_CHANGED');

    const before = db
      .prepare(
        `SELECT last_scanned_block AS blockNumber,last_scanned_hash AS blockHash
         FROM indexer_checkpoint WHERE deployment_id=?`,
      )
      .get(hashes.deployment);

    await expect(store.commit([block(2n)], [], block(2n))).rejects.toThrow(
      'PROJECTION_RECOVERY_REQUIRED',
    );

    const after = db
      .prepare(
        `SELECT last_scanned_block AS blockNumber,last_scanned_hash AS blockHash
         FROM indexer_checkpoint WHERE deployment_id=?`,
      )
      .get(hashes.deployment);
    expect(after).toEqual(before);
    expect(readRuntime(db)).toEqual({
      projectionStatus: 'RECOVERY_REQUIRED',
      recoveryReason: 'CHECKPOINT_HASH_CHANGED',
    });
    db.close();
  });

  it('refuses normal writer startup while a recovery barrier is durable', async () => {
    const { root, paths } = await databaseFixture('r25-writer-barrier');
    roots.push(root);
    const db = new Database(paths.databasePath);
    forceRecovery(db, 'CHECKPOINT_HASH_CHANGED');
    db.close();

    await expect(openProjectionWriter(paths)).rejects.toThrow('PROJECTION_RECOVERY_REQUIRED');
  });

  it('rejects REBUILD for canonicality evidence before creating a maintenance marker', async () => {
    const { root, paths } = await databaseFixture('r25-rebuild-policy');
    roots.push(root);
    const db = new Database(paths.databasePath);
    forceRecovery(db, 'CHECKPOINT_HASH_CHANGED');
    db.close();
    const run = vi.fn(() => 'must-not-run');

    await expect(
      runProjectionMaintenance(paths, {
        operationType: 'REBUILD_PROJECTION',
        expectedDeploymentId: hashes.deployment,
        run,
      }),
    ).rejects.toThrow('RECOVERY_OPERATION_NOT_ALLOWED');

    expect(run).not.toHaveBeenCalled();
    expect(existsSync(paths.maintenancePath)).toBe(false);
  });

  it('allows REINDEX for canonicality evidence', async () => {
    const { root, paths } = await databaseFixture('r25-reindex-policy');
    roots.push(root);
    const db = new Database(paths.databasePath);
    forceRecovery(db, 'CHECKPOINT_HASH_CHANGED');
    db.close();
    const run = vi.fn((database: Database.Database) => {
      database
        .prepare(
          "UPDATE indexer_runtime_status SET projection_status='SYNCING',recovery_reason=NULL WHERE deployment_id=?",
        )
        .run(hashes.deployment);
      return 'reindexed';
    });

    await expect(
      runProjectionMaintenance(paths, {
        operationType: 'REINDEX_PROJECTION',
        expectedDeploymentId: hashes.deployment,
        recovery: {
          reindexFromBlock: '1',
          targetBlock: '1',
          targetHash: hashes.block,
        },
        run,
      }),
    ).resolves.toMatchObject({ result: 'reindexed' });
    expect(run).toHaveBeenCalledOnce();
  });

  it('allows REBUILD for projector-only recovery evidence', async () => {
    const { root, paths } = await databaseFixture('r25-projector-policy');
    roots.push(root);
    const db = new Database(paths.databasePath);
    forceRecovery(db, 'PROJECTOR_INTEGRITY');
    db.close();
    const run = vi.fn((database: Database.Database) => {
      database
        .prepare(
          "UPDATE indexer_runtime_status SET projection_status='CURRENT',recovery_reason=NULL WHERE deployment_id=?",
        )
        .run(hashes.deployment);
      return 'rebuilt';
    });

    await expect(
      runProjectionMaintenance(paths, {
        operationType: 'REBUILD_PROJECTION',
        expectedDeploymentId: hashes.deployment,
        run,
      }),
    ).resolves.toMatchObject({ result: 'rebuilt' });
    expect(run).toHaveBeenCalledOnce();
  });

  it('keeps the barrier when a maintenance callback omits recovery postconditions', async () => {
    const { root, paths } = await databaseFixture('r25-incomplete-reindex');
    roots.push(root);
    const db = new Database(paths.databasePath);
    forceRecovery(db, 'CHECKPOINT_HASH_CHANGED');
    db.close();
    await expect(
      runProjectionMaintenance(paths, {
        operationType: 'REINDEX_PROJECTION',
        expectedDeploymentId: hashes.deployment,
        recovery: { reindexFromBlock: '1', targetBlock: '1', targetHash: hashes.block },
        run: () => 'not-reindexed',
      }),
    ).rejects.toThrow('RECOVERY_POSTCONDITION_INCOMPLETE');
    const persisted = new Database(paths.databasePath);
    expect(readRuntime(persisted)).toEqual({
      projectionStatus: 'RECOVERY_REQUIRED',
      recoveryReason: 'CHECKPOINT_HASH_CHANGED',
    });
    persisted.close();
    expect(existsSync(paths.maintenancePath)).toBe(true);
  });

  it('preserves the barrier through reindex replay and releases it only at the verified target', async () => {
    const { root, paths } = await databaseFixture('r25-reindex-barrier-lifetime');
    roots.push(root);
    const db = new Database(paths.databasePath);
    forceRecovery(db, 'CHECKPOINT_HASH_CHANGED');
    const store = SqliteProjectionStore.forMaintenance(
      db,
      hashes.deployment,
      hashes.address,
      hashes.scope,
      { allowReindexRecovery: true },
    );
    store.prepareForReindex(1n);
    store.rebuildFromJournal();
    expect(readRuntime(db)).toEqual({
      projectionStatus: 'RECOVERY_REQUIRED',
      recoveryReason: 'CHECKPOINT_HASH_CHANGED',
    });
    const target = block(1n);
    expect(() => store.completeReindexRecovery(target.number, target.hash)).toThrow(
      'REINDEX_CATCHUP_INCOMPLETE',
    );
    await store.commit([target], [], target);
    expect(readRuntime(db).projectionStatus).toBe('RECOVERY_REQUIRED');
    store.completeReindexRecovery(target.number, target.hash);
    expect(readRuntime(db)).toEqual({ projectionStatus: 'SYNCING', recoveryReason: null });
    db.close();
  });

  it('does not let a successful idle observation mark a recovery barrier CURRENT', async () => {
    const { root, paths } = await databaseFixture('r25-current-barrier');
    roots.push(root);
    const db = new Database(paths.databasePath);
    forceRecovery(db, 'CHECKPOINT_HASH_CHANGED');
    const store = SqliteProjectionStore.forMaintenance(
      db,
      hashes.deployment,
      hashes.address,
      hashes.scope,
    );
    await store.markCurrent(1n);
    expect(readRuntime(db)).toEqual({
      projectionStatus: 'RECOVERY_REQUIRED',
      recoveryReason: 'CHECKPOINT_HASH_CHANGED',
    });
    db.close();
  });

  it('keeps reconciliation diagnostics available without opening a runtime projection writer', async () => {
    const { root, paths } = await databaseFixture('r25-diagnostic-barrier');
    roots.push(root);
    const db = new Database(paths.databasePath);
    forceRecovery(db, 'CHECKPOINT_HASH_CHANGED');
    db.close();
    await expect(openProjectionWriter(paths)).rejects.toThrow('PROJECTION_RECOVERY_REQUIRED');
    const diagnostic = await openReconciliationDatabase(paths);
    expect(readRuntime(diagnostic.database)).toEqual({
      projectionStatus: 'RECOVERY_REQUIRED',
      recoveryReason: 'CHECKPOINT_HASH_CHANGED',
    });
    await diagnostic.close();
  });
});
