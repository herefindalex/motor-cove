import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const deploymentId = `0x${'a'.repeat(64)}`;
const blockHash = `0x${'b'.repeat(64)}`;
const contractAddress = `0x${'c'.repeat(40)}`;
const state = vi.hoisted(() => ({
  database: undefined as unknown as Database.Database,
  closeCalls: 0,
  getBlock: vi.fn(),
  readContract: vi.fn(),
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
    getBlock: state.getBlock,
    readContract: state.readContract,
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
    CREATE TABLE sales(
      deployment_id TEXT,
      sale_id TEXT,
      token_id TEXT,
      seller TEXT,
      buyer TEXT,
      price_wei TEXT,
      funded_at INTEGER,
      expires_at INTEGER,
      status TEXT,
      token_reclaimed INTEGER
    );
    CREATE TABLE payment_claims(
      deployment_id TEXT,
      sale_id TEXT,
      beneficiary TEXT,
      amount_wei TEXT,
      kind TEXT,
      status TEXT
    );
    CREATE TABLE token_ownership(
      deployment_id TEXT,
      collection_address TEXT,
      token_id TEXT,
      owner TEXT
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
    state.getBlock.mockReset();
    state.getBlock.mockRejectedValue(new Error('CONTROLLED_HEAD_UNAVAILABLE'));
    state.readContract.mockReset();
    state.readContract.mockRejectedValue(new Error('contract reads must not run without a head'));
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

  it('uses a publication-time head when the chain advances during comparison', async () => {
    const head = { number: 10n, hash: blockHash };
    const laterHead = { number: 11n, hash: `0x${'d'.repeat(64)}` };
    state.getBlock
      .mockReset()
      .mockResolvedValueOnce(head)
      .mockResolvedValueOnce(head)
      .mockResolvedValueOnce(head)
      .mockResolvedValueOnce(laterHead);
    state.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'saleCount') return 0n;
      if (functionName === 'nextTokenId') return 1n;
      throw new Error(`unexpected contract read: ${functionName}`);
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await import('../../apps/indexer/src/cli/reconcile.js');

    const report = state.database
      .prepare(
        'SELECT comparison,freshness,differences_json AS differencesJson FROM reconciliation_runs ORDER BY created_at DESC LIMIT 1',
      )
      .get() as { comparison: string; freshness: string; differencesJson: string };
    expect(report).toEqual({
      comparison: 'MATCH',
      freshness: 'PROJECTION_LAGGING',
      differencesJson: '[]',
    });
    expect(state.getBlock).toHaveBeenCalledTimes(4);
    expect(process.exitCode).toBe(0);
  });

  it('persists HEAD_UNKNOWN when the publication-time head cannot be read', async () => {
    const head = { number: 5n, hash: blockHash };
    state.getBlock
      .mockReset()
      .mockResolvedValueOnce(head)
      .mockResolvedValueOnce(head)
      .mockResolvedValueOnce(head)
      .mockRejectedValueOnce(new Error('CONTROLLED_PUBLICATION_HEAD_UNAVAILABLE'));
    state.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'saleCount') return 0n;
      if (functionName === 'nextTokenId') return 1n;
      throw new Error(`unexpected contract read: ${functionName}`);
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await import('../../apps/indexer/src/cli/reconcile.js');

    const report = state.database
      .prepare(
        'SELECT comparison,freshness,differences_json AS differencesJson FROM reconciliation_runs ORDER BY created_at DESC LIMIT 1',
      )
      .get() as { comparison: string; freshness: string; differencesJson: string };
    expect(report.comparison).toBe('UNVERIFIABLE');
    expect(report.freshness).toBe('HEAD_UNKNOWN');
    expect(JSON.parse(report.differencesJson)).toContainEqual({
      error: 'CONTROLLED_PUBLICATION_HEAD_UNAVAILABLE',
    });
    expect(process.exitCode).toBe(1);
  });
});
