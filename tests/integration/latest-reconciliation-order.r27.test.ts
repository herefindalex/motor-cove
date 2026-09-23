import Database from 'better-sqlite3';
import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createReadOnlyReader } from '@motorcove/database/reader';
import { databaseFixture, hashes } from '../helpers/database.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('R27 reconciliation publication order', () => {
  it('returns the later inserted report when the publication clock moves backward', async () => {
    const { root, paths } = await databaseFixture('r27-reconciliation-order');
    roots.push(root);
    const db = new Database(paths.databasePath);
    const insert = db.prepare(`
      INSERT INTO reconciliation_runs(
        id,deployment_id,run_sequence,comparison,freshness,block_number,block_hash,
        projector_version,projection_build_id,log_scope_hash,scope_json,
        differences_json,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const common = [
      hashes.deployment,
      'CURRENT',
      1,
      hashes.block,
      '1',
      'fixture-build',
      hashes.scope,
      '{}',
      '[]',
    ] as const;
    insert.run('first', common[0], 1, 'MATCH', ...common.slice(1), '2026-09-23T12:00:00.000Z');
    insert.run('second', common[0], 2, 'MISMATCH', ...common.slice(1), '2026-09-23T11:59:00.000Z');
    db.close();

    const reader = await createReadOnlyReader(paths, hashes.deployment);
    try {
      expect(reader.latestReconciliation().data).toMatchObject({
        comparison: 'MISMATCH',
        createdAt: '2026-09-23T11:59:00.000Z',
      });
    } finally {
      await reader.close();
    }
  });
});
