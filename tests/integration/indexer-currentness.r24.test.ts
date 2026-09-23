import Database from 'better-sqlite3';
import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
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

function runtime(db: Database.Database) {
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

describe('R24 projection currentness', () => {
  it('does not let one successful batch promote a still-catching-up projection to CURRENT', async () => {
    const { root, paths } = await databaseFixture('r24-currentness');
    roots.push(root);
    const db = new Database(paths.databasePath);
    db.prepare(
      `UPDATE indexer_runtime_status
       SET projection_status='SYNCING',recovery_reason=NULL
       WHERE deployment_id=?`,
    ).run(hashes.deployment);

    const store = SqliteProjectionStore.forMaintenance(
      db,
      hashes.deployment,
      hashes.address,
      hashes.scope,
    );

    await store.commit([block(2n)], [], block(2n));
    expect(runtime(db)).toEqual({ projectionStatus: 'SYNCING', recoveryReason: null });

    await store.markCurrent(3n);
    expect(runtime(db)).toEqual({ projectionStatus: 'CURRENT', recoveryReason: null });
    db.close();
  });
});
