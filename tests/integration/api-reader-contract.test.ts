import Database from 'better-sqlite3';
import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { publicConfigSchema } from '../../packages/api-contracts/src/index.js';
import { createReadOnlyReader } from '../../packages/database/src/reader/index.js';
import { createApp } from '../../apps/api/src/app/create-app.js';
import { databaseFixture, hashes } from '../helpers/database.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const config = publicConfigSchema.parse({
  deploymentId: hashes.deployment,
  chainId: '31337',
  protocolVersion: '0.2.0',
  nftAddress: hashes.address,
  escrowAddress: hashes.escrow,
  fundingPeriodSeconds: '300',
});

describe('API with the real SQLite reader', () => {
  it('returns a schema-valid null when no reconciliation report exists', async () => {
    const { root, paths } = await databaseFixture('api-empty-report');
    roots.push(root);
    const app = await createApp(await createReadOnlyReader(paths, hashes.deployment), config);
    const response = await app.inject({ method: 'GET', url: '/v1/system/reconciliation' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: null });
    await app.close();
  });

  it.each(['MATCH', 'MISMATCH', 'UNVERIFIABLE'] as const)(
    'returns the persisted %s report scope separately from current provenance',
    async (comparison) => {
      const { root, paths } = await databaseFixture(`api-report-${comparison.toLowerCase()}`);
      roots.push(root);
      const reportScope = `0x${'a'.repeat(64)}`;
      const db = new Database(paths.databasePath);
      db.prepare(
        `INSERT INTO reconciliation_runs(
        id,deployment_id,run_sequence,comparison,freshness,block_number,block_hash,projector_version,
          projection_build_id,log_scope_hash,scope_json,differences_json,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        `report-${comparison}`,
        hashes.deployment,
        1,
        comparison,
        'CURRENT',
        1,
        hashes.block,
        '1',
        'report-build',
        reportScope,
        JSON.stringify({ paymentClaims: true }),
        JSON.stringify([]),
        new Date(0).toISOString(),
      );
      db.close();

      const app = await createApp(await createReadOnlyReader(paths, hashes.deployment), config);
      const response = await app.inject({ method: 'GET', url: '/v1/system/reconciliation' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        data: { comparison, logScopeHash: reportScope },
        provenance: { logScopeHash: hashes.scope },
      });
      await app.close();
    },
  );

  it('marks an expired heartbeat unknown without changing the last projection status', async () => {
    const { root, paths } = await databaseFixture('api-stale-heartbeat');
    roots.push(root);
    const heartbeat = new Date('2026-09-22T00:00:00.000Z');
    const db = new Database(paths.databasePath);
    db.prepare(
      `UPDATE indexer_runtime_status SET projection_status='CURRENT',last_observed_head=1,last_eligible_head=1,
       last_observed_at=?,last_rpc_success_at=?,worker_heartbeat_at=?,recovery_reason=NULL
       WHERE deployment_id=?`,
    ).run(
      heartbeat.toISOString(),
      heartbeat.toISOString(),
      heartbeat.toISOString(),
      hashes.deployment,
    );
    db.close();

    let app = await createApp(
      await createReadOnlyReader(paths, hashes.deployment, {
        now: () => new Date(heartbeat.getTime() + 60 * 60 * 1_000),
        heartbeatStaleAfterMs: 30_000,
      }),
      config,
    );
    let response = await app.inject({ method: 'GET', url: '/v1/system/status' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        projectionStatus: 'CURRENT',
        observationFreshness: 'STALE',
        observationAgeSeconds: '3600',
        lagBlocks: null,
      },
    });
    await app.close();

    const refreshedAt = new Date(heartbeat.getTime() + 60 * 60 * 1_000 - 1_000);
    const refreshed = new Database(paths.databasePath);
    refreshed
      .prepare('UPDATE indexer_runtime_status SET worker_heartbeat_at=? WHERE deployment_id=?')
      .run(refreshedAt.toISOString(), hashes.deployment);
    refreshed.close();
    app = await createApp(
      await createReadOnlyReader(paths, hashes.deployment, {
        now: () => new Date(heartbeat.getTime() + 60 * 60 * 1_000),
        heartbeatStaleAfterMs: 30_000,
      }),
      config,
    );
    response = await app.inject({ method: 'GET', url: '/v1/system/status' });
    expect(response.json()).toMatchObject({
      data: { projectionStatus: 'CURRENT', observationFreshness: 'FRESH', lagBlocks: '0' },
    });
    await app.close();
  });

  it('does not treat a future worker heartbeat as fresh observation', async () => {
    const { root, paths } = await databaseFixture('api-future-heartbeat');
    roots.push(root);
    const now = new Date('2026-09-22T00:00:00.000Z');
    const future = new Date(now.getTime() + 60_000);
    const db = new Database(paths.databasePath);
    db.prepare(
      `UPDATE indexer_runtime_status
       SET projection_status='CURRENT',last_observed_head=1,
           last_observed_at=?,last_rpc_success_at=?,worker_heartbeat_at=?,recovery_reason=NULL
       WHERE deployment_id=?`,
    ).run(future.toISOString(), future.toISOString(), future.toISOString(), hashes.deployment);
    db.close();

    const app = await createApp(
      await createReadOnlyReader(paths, hashes.deployment, { now: () => now }),
      config,
    );
    const response = await app.inject({ method: 'GET', url: '/v1/system/status' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        projectionStatus: 'CURRENT',
        observationFreshness: 'UNKNOWN',
        observationAgeSeconds: null,
        lagBlocks: null,
      },
    });
    await app.close();
  });

  it('does not clear recovery-required when its observation heartbeat is stale', async () => {
    const { root, paths } = await databaseFixture('api-stale-recovery');
    roots.push(root);
    const db = new Database(paths.databasePath);
    db.prepare(
      `UPDATE indexer_runtime_status SET projection_status='RECOVERY_REQUIRED',
       worker_heartbeat_at=?,recovery_reason='CHECKPOINT_HASH_CHANGED' WHERE deployment_id=?`,
    ).run('2026-09-22T00:00:00.000Z', hashes.deployment);
    db.close();
    const app = await createApp(
      await createReadOnlyReader(paths, hashes.deployment, {
        now: () => new Date('2026-09-22T01:00:00.000Z'),
      }),
      config,
    );
    const response = await app.inject({ method: 'GET', url: '/v1/system/status' });
    expect(response.json()).toMatchObject({
      data: {
        projectionStatus: 'RECOVERY_REQUIRED',
        observationFreshness: 'STALE',
        recoveryReason: 'CHECKPOINT_HASH_CHANGED',
      },
    });
    await app.close();
  });
});
