import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const deploymentId = `0x${'a'.repeat(64)}`;
const blockHash = `0x${'b'.repeat(64)}`;
const contractAddress = `0x${'c'.repeat(40)}`;
const state = vi.hoisted(() => ({
  database: undefined as unknown as Database.Database,
  failLaterRead: false,
  saleCount: 0n,
  readContract: vi.fn(),
}));

vi.mock('@motorcove/database/maintenance', () => ({
  openReconciliationDatabase: async () => ({
    database: state.database,
    close: async () => undefined,
  }),
}));
vi.mock('@motorcove/chain-artifacts', () => ({ motorCoveEscrowAbi: [], vehicleNftAbi: [] }));
vi.mock('viem', () => ({
  createPublicClient: () => ({
    getBlock: async () => ({ number: 5n, hash: blockHash }),
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

function databaseFixture(): Database.Database {
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE indexer_checkpoint (
      deployment_id TEXT PRIMARY KEY, last_scanned_block INTEGER, last_scanned_hash TEXT,
      projector_version TEXT, projection_build_id TEXT, log_scope_hash TEXT
    );
    CREATE TABLE sales (
      deployment_id TEXT, sale_id TEXT, token_id TEXT, seller TEXT, buyer TEXT,
      price_wei TEXT, funded_at TEXT, expires_at TEXT, status TEXT, token_reclaimed INTEGER
    );
    CREATE TABLE payment_claims (
      deployment_id TEXT, sale_id TEXT, beneficiary TEXT, amount_wei TEXT, kind TEXT, status TEXT
    );
    CREATE TABLE token_ownership (
      deployment_id TEXT, collection_address TEXT, token_id TEXT, owner TEXT
    );
    CREATE TABLE reconciliation_runs (
      id TEXT PRIMARY KEY, deployment_id TEXT, run_sequence INTEGER, comparison TEXT,
      freshness TEXT, block_number INTEGER, block_hash TEXT, projector_version TEXT,
      projection_build_id TEXT, log_scope_hash TEXT, scope_json TEXT,
      differences_json TEXT, created_at TEXT
    );
  `);
  database
    .prepare('INSERT INTO indexer_checkpoint VALUES (?,?,?,?,?,?)')
    .run(deploymentId, 5, blockHash, '1', 'fixture-build', `0x${'d'.repeat(64)}`);
  database
    .prepare('INSERT INTO sales VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(deploymentId, '999', '1', contractAddress, null, '1', null, null, 'LISTED', 0);
  return database;
}

function latestReport() {
  const row = state.database
    .prepare(
      'SELECT comparison,scope_json AS scopeJson,differences_json AS differencesJson FROM reconciliation_runs LIMIT 1',
    )
    .get() as { comparison: string; scopeJson: string; differencesJson: string };
  return {
    comparison: row.comparison,
    scope: JSON.parse(row.scopeJson) as Record<string, unknown>,
    differences: JSON.parse(row.differencesJson) as Array<Record<string, unknown>>,
  };
}

beforeEach(() => {
  state.database = databaseFixture();
  state.failLaterRead = false;
  state.saleCount = 0n;
  state.readContract.mockReset();
  state.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
    if (functionName === 'saleCount') return state.saleCount;
    if (functionName === 'getSale') throw new Error('GET_SALE_OUT_OF_RANGE');
    if (functionName === 'nextTokenId') {
      if (state.failLaterRead) throw new Error('CONTROLLED_LATER_READ_FAILURE');
      return 1n;
    }
    throw new Error(`UNEXPECTED_CONTRACT_READ:${functionName}`);
  });
  process.exitCode = 0;
  vi.resetModules();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  state.database.close();
  process.exitCode = 0;
  vi.restoreAllMocks();
});

describe('R27 reconciliation extra sales', () => {
  it('reports a projected sale beyond saleCount as a mismatch without reading that sale', async () => {
    await import('../../apps/indexer/src/cli/reconcile.js');
    const report = latestReport();
    expect(report.comparison).toBe('MISMATCH');
    expect(report.differences).toContainEqual(
      expect.objectContaining({
        saleId: '999',
        field: 'sale',
        difference: 'EXTRA_PROJECTED_ROW',
        chain: null,
      }),
    );
    expect(state.readContract).not.toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'getSale' }),
    );
    expect(report.scope.sales).toEqual({ firstSaleId: null, lastSaleId: null });
    expect(report.scope.paymentClaims).toEqual(
      expect.objectContaining({ firstSaleId: null, lastSaleId: null }),
    );
  });

  it('keeps a known mismatch when a later chain read becomes unavailable', async () => {
    state.failLaterRead = true;
    await import('../../apps/indexer/src/cli/reconcile.js');
    const report = latestReport();
    expect(report.comparison).toBe('MISMATCH');
    expect(report.differences).toContainEqual(
      expect.objectContaining({ saleId: '999', difference: 'EXTRA_PROJECTED_ROW' }),
    );
    expect(report.differences).toContainEqual({ error: 'CONTROLLED_LATER_READ_FAILURE' });
  });

  it('records an extra sale before an in-range contract read can fail', async () => {
    state.saleCount = 1n;
    state.database
      .prepare('INSERT INTO sales VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(deploymentId, '1', '1', contractAddress, null, '1', null, null, 'LISTED', 0);
    await import('../../apps/indexer/src/cli/reconcile.js');
    const report = latestReport();
    expect(report.comparison).toBe('MISMATCH');
    expect(report.differences).toContainEqual(
      expect.objectContaining({ saleId: '999', difference: 'EXTRA_PROJECTED_ROW' }),
    );
    expect(report.differences).toContainEqual({ error: 'GET_SALE_OUT_OF_RANGE' });
  });

  it('publishes a monotonic sequence for consecutive reports of the deployment', async () => {
    await import('../../apps/indexer/src/cli/reconcile.js');
    process.exitCode = 0;
    vi.resetModules();
    await import('../../apps/indexer/src/cli/reconcile.js');
    expect(
      state.database
        .prepare('SELECT run_sequence AS runSequence FROM reconciliation_runs ORDER BY rowid')
        .all(),
    ).toEqual([{ runSequence: 1 }, { runSequence: 2 }]);
  });
});
