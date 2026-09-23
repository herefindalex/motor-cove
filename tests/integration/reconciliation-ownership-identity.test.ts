import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const deploymentId = `0x${'a'.repeat(64)}`;
const otherDeploymentId = `0x${'e'.repeat(64)}`;
const blockHash = `0x${'b'.repeat(64)}`;
const collectionAddress = `0x${'c'.repeat(40)}`;
const otherCollectionAddress = `0x${'d'.repeat(40)}`;
const owner = `0x${'1'.repeat(40)}`;
const otherOwner = `0x${'2'.repeat(40)}`;

const state = vi.hoisted(() => ({
  database: undefined as unknown as Database.Database,
}));

vi.mock('@motorcove/database/maintenance', () => ({
  openReconciliationDatabase: async () => ({
    database: state.database,
    close: async () => undefined,
  }),
}));

vi.mock('@motorcove/chain-artifacts', () => ({
  motorCoveEscrowAbi: [],
  vehicleNftAbi: [],
}));

vi.mock('viem', () => ({
  createPublicClient: () => ({
    getBlock: async () => ({ number: 5n, hash: blockHash }),
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName === 'saleCount') return 0n;
      if (functionName === 'nextTokenId') return 2n;
      if (functionName === 'ownerOf') return owner;
      throw new Error(`UNEXPECTED_CONTRACT_READ:${functionName}`);
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
      nft: { address: collectionAddress },
      escrow: { address: `0x${'f'.repeat(40)}` },
    },
  }),
}));

type OwnershipRow = {
  deploymentId?: string;
  collectionAddress: string;
  tokenId: string;
  owner: string;
};

function databaseFixture(rows: OwnershipRow[]) {
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
      owner TEXT,
      PRIMARY KEY(deployment_id, collection_address, token_id)
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
    .run(deploymentId, 5, blockHash, '1', 'fixture-build', `0x${'3'.repeat(64)}`);
  const insert = database.prepare('INSERT INTO token_ownership VALUES (?,?,?,?)');
  for (const row of rows) {
    insert.run(row.deploymentId ?? deploymentId, row.collectionAddress, row.tokenId, row.owner);
  }
  return database;
}

async function reconcile(rows: OwnershipRow[]) {
  state.database = databaseFixture(rows);
  process.exitCode = 0;
  vi.resetModules();
  await import('../../apps/indexer/src/cli/reconcile.js');
  return state.database
    .prepare(
      'SELECT comparison,differences_json AS differencesJson FROM reconciliation_runs ORDER BY created_at DESC LIMIT 1',
    )
    .get() as { comparison: string; differencesJson: string };
}

describe('reconciliation NFT collection identity', () => {
  beforeEach(() => {
    process.exitCode = 0;
  });

  afterEach(() => {
    state.database.close();
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it('matches the manifest collection and ignores another deployment', async () => {
    const report = await reconcile([
      { collectionAddress, tokenId: '1', owner },
      {
        deploymentId: otherDeploymentId,
        collectionAddress: otherCollectionAddress,
        tokenId: '1',
        owner,
      },
    ]);

    expect(report.comparison).toBe('MATCH');
    expect(JSON.parse(report.differencesJson)).toEqual([]);
  });

  it('reports a wrong collection as extra and the expected collection as missing', async () => {
    const report = await reconcile([
      { collectionAddress: otherCollectionAddress, tokenId: '1', owner },
    ]);
    const differences = JSON.parse(report.differencesJson) as Array<Record<string, unknown>>;

    expect(report.comparison).toBe('MISMATCH');
    expect(differences).toContainEqual({
      collectionAddress: otherCollectionAddress,
      tokenId: '1',
      field: 'currentOwner',
      difference: 'UNEXPECTED_COLLECTION',
      projected: owner,
      chain: null,
    });
    expect(differences).toContainEqual({
      collectionAddress,
      tokenId: '1',
      field: 'currentOwner',
      projected: null,
      chain: owner,
    });
  });

  it('reports a wrong collection even when the expected row also exists', async () => {
    const report = await reconcile([
      { collectionAddress, tokenId: '1', owner },
      { collectionAddress: otherCollectionAddress, tokenId: '1', owner },
    ]);

    expect(report.comparison).toBe('MISMATCH');
    expect(JSON.parse(report.differencesJson)).toContainEqual({
      collectionAddress: otherCollectionAddress,
      tokenId: '1',
      field: 'currentOwner',
      difference: 'UNEXPECTED_COLLECTION',
      projected: owner,
      chain: null,
    });
  });

  it('reports extra tokens and owner mismatches within the expected collection', async () => {
    const report = await reconcile([
      { collectionAddress, tokenId: '1', owner: otherOwner },
      { collectionAddress, tokenId: '2', owner },
    ]);
    const differences = JSON.parse(report.differencesJson) as Array<Record<string, unknown>>;

    expect(report.comparison).toBe('MISMATCH');
    expect(differences).toContainEqual({
      collectionAddress,
      tokenId: '1',
      field: 'currentOwner',
      projected: otherOwner,
      chain: owner,
    });
    expect(differences).toContainEqual({
      collectionAddress,
      tokenId: '2',
      field: 'currentOwner',
      difference: 'EXTRA_PROJECTED_ROW',
      projected: owner,
      chain: null,
    });
  });
});
