import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const deploymentId = `0x${'a'.repeat(64)}`;
const blockHash = `0x${'b'.repeat(64)}`;
const contractAddress = `0x${'c'.repeat(40)}`;
const state = vi.hoisted(() => ({
  database: undefined as unknown as Database.Database,
  closeCalls: 0,
}));

vi.mock('@motorcove/database/projection-writer', () => ({
  openProjectionWriter: async () => ({
    database: state.database,
    close: async () => {
      state.closeCalls += 1;
    },
  }),
}));

vi.mock('@motorcove/chain-artifacts', () => ({
  motorCoveEscrowAbi: [],
  vehicleNftAbi: [],
}));

vi.mock('viem', () => ({
  createPublicClient: () => ({
    getBlock: async () => {
      throw new Error('CONTROLLED_HEAD_UNAVAILABLE');
    },
    readContract: async () => {
      throw new Error('contract reads must not run without a head');
    },
  }),
  http: () => ({}),
}));

vi.mock('../../apps/indexer/src/runtime/config.js', () => ({
  loadConfig: () => ({
    environment: {},
    rpcUrl: 'http://127.0.0.1:1',
    manifest: {
      deploymentId,
      nft: { address: contractAddress },
      escrow: { address: contractAddress },
    },
  }),
}));

function databaseFixture() {
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE indexer_checkpoint(
      deployment_id TEXT PRIMARY KEY,
      last_scanned_block INTEGER,
      last_scanned_hash TEXT,
      projector_version TEXT,
      projection_build_id TEXT,
      log_scope_hash TEXT
    );
    CREATE TABLE reconciliation_runs(
      id TEXT PRIMARY KEY,
      deployment_id TEXT,
      comparison TEXT,
      freshness TEXT,
      block_number INTEGER,
      block_hash TEXT,
      projector_version TEXT,
      projection_build_id TEXT,
      log_scope_hash TEXT,
      scope_json TEXT,
      differences_json TEXT,
      created_at TEXT
    );
  `);
  database
    .prepare('INSERT INTO indexer_checkpoint VALUES (?,?,?,?,?,?)')
    .run(deploymentId, 5, blockHash, '1', 'fixture-build', blockHash);
  database
    .prepare('INSERT INTO reconciliation_runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(
      'prior-match',
      deploymentId,
      'MATCH',
      'CURRENT',
      5,
      blockHash,
      '1',
      'fixture-build',
      blockHash,
      '{}',
      '[]',
      '2026-09-01T00:00:00.000Z',
    );
  return database;
}

describe('reconciliation report lifecycle', () => {
  beforeEach(() => {
    state.database = databaseFixture();
    state.closeCalls = 0;
    process.exitCode = 0;
    vi.resetModules();
  });

  afterEach(() => {
    state.database.close();
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it('persists an UNVERIFIABLE HEAD_UNKNOWN report when the first RPC read fails', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await import('../../apps/indexer/src/cli/reconcile.js');

    const reports = state.database
      .prepare(
        'SELECT comparison,freshness,block_number AS blockNumber,block_hash AS blockHash,differences_json AS differencesJson FROM reconciliation_runs ORDER BY created_at',
      )
      .all() as Array<{
      comparison: string;
      freshness: string;
      blockNumber: number;
      blockHash: string;
      differencesJson: string;
    }>;
    expect(reports).toHaveLength(2);
    expect(reports[0]).toMatchObject({ comparison: 'MATCH', freshness: 'CURRENT' });
    expect(reports[1]).toMatchObject({
      comparison: 'UNVERIFIABLE',
      freshness: 'HEAD_UNKNOWN',
      blockNumber: 5,
      blockHash,
    });
    expect(JSON.parse(reports[1]?.differencesJson ?? '[]')).toEqual([
      { error: 'CONTROLLED_HEAD_UNAVAILABLE' },
    ]);
    expect(output).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(1);
    expect(state.closeCalls).toBe(1);
  });
});
