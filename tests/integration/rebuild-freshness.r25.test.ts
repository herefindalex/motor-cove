import Database from 'better-sqlite3';
import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createReadOnlyReader } from '@motorcove/database/reader';
import { SqliteProjectionStore } from '../../apps/indexer/src/adapters/sqlite/sqlite-projection-store.js';
import { databaseFixture, hashes } from '../helpers/database.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('R25 rebuild freshness ownership', () => {
  it('does not refresh live observation freshness during a local-only journal rebuild', async () => {
    const { root, paths } = await databaseFixture('r25-rebuild-freshness');
    roots.push(root);
    const old = new Date(Date.now() - 60 * 60 * 1_000);
    const db = new Database(paths.databasePath);

    const store = SqliteProjectionStore.forMaintenance(
      db,
      hashes.deployment,
      hashes.address,
      hashes.scope,
    );
    const emptyBlock = {
      number: 1n,
      hash: hashes.block as `0x${string}`,
      parentHash: hashes.parent as `0x${string}`,
      timestamp: 1_700_000_000n,
    };
    await store.commit([emptyBlock], [], emptyBlock);
    db.prepare(
      `UPDATE indexer_runtime_status
       SET projection_status='STALE',
           last_observed_head=NULL,
           last_observed_at=?,
           last_rpc_success_at=?,
           worker_heartbeat_at=?,
           recovery_reason=NULL
       WHERE deployment_id=?`,
    ).run(old.toISOString(), old.toISOString(), old.toISOString(), hashes.deployment);

    expect(store.rebuildFromJournal()).toMatchObject({ events: 0 });

    const persisted = db
      .prepare(
        `SELECT worker_heartbeat_at AS workerHeartbeatAt,
                last_rpc_success_at AS lastRpcSuccessAt
         FROM indexer_runtime_status WHERE deployment_id=?`,
      )
      .get(hashes.deployment) as {
      workerHeartbeatAt: string | null;
      lastRpcSuccessAt: string | null;
    };
    expect(persisted).toEqual({
      workerHeartbeatAt: old.toISOString(),
      lastRpcSuccessAt: old.toISOString(),
    });
    db.close();

    const reader = await createReadOnlyReader(paths, hashes.deployment, {
      now: () => new Date(),
      heartbeatStaleAfterMs: 30_000,
    });
    expect(reader.systemStatus().data).toMatchObject({
      projectionStatus: 'CURRENT',
      observationFreshness: 'STALE',
    });
    await reader.close();
  });
});
