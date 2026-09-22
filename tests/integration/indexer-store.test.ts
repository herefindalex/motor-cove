import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  backupEnvironment,
  environmentPaths,
  migrateEnvironment,
  registerDeployment,
  seedCatalog,
  verifyBackup,
} from '@motorcove/database/maintenance';
import { openProjectionWriter } from '@motorcove/database/projection-writer';
import { createReadOnlyReader } from '@motorcove/database/reader';
import { localCatalogSeed } from '@motorcove/database/seeds';
import { SqliteProjectionStore } from '../../apps/indexer/src/adapters/sqlite/sqlite-projection-store.js';
import type { OrderedEvent } from '../../apps/indexer/src/domain/events.js';
import type { BlockHeader } from '../../apps/indexer/src/ports/index.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const hex = (character: string, bytes: number) => `0x${character.repeat(bytes * 2)}`;
const deploymentId = hex('a', 32);
const nft = hex('b', 20);
const escrow = hex('c', 20);
const seller = hex('d', 20);
const buyer = hex('e', 20);
const scopeHash = hex('1', 32);

const header = (number: number): BlockHeader => ({
  number: BigInt(number),
  hash: hex(String(number), 32) as `0x${string}`,
  parentHash: hex(String(Math.max(0, number - 1)), 32) as `0x${string}`,
  timestamp: BigInt(1_700_000_000 + number),
});

const event = (
  block: BlockHeader,
  logIndex: number,
  normalized: OrderedEvent['event'],
  contractAddress: string = escrow,
): OrderedEvent => ({
  blockNumber: block.number,
  blockHash: block.hash,
  transactionHash: hex(String(logIndex + 3), 32) as `0x${string}`,
  transactionIndex: 0,
  logIndex,
  contractAddress: contractAddress as `0x${string}`,
  topics: [],
  data: '0x',
  event: normalized,
});

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'motorcove-indexer-'));
  roots.push(root);
  const paths = environmentPaths(root, 'integration');
  await migrateEnvironment(paths);
  await registerDeployment(paths, {
    deploymentId,
    chainId: '31337',
    nftAddress: nft,
    escrowAddress: escrow,
    protocolVersion: '0.1.0',
    abiBundleHash: hex('2', 32),
    scanStartBlock: 1,
    nftDeploymentBlock: 1,
    nftDeploymentHash: hex('3', 32),
    nftRuntimeCodeHash: hex('4', 32),
    escrowDeploymentBlock: 1,
    escrowDeploymentHash: hex('5', 32),
    escrowRuntimeCodeHash: hex('6', 32),
    manifestHash: hex('7', 32),
    manifestJson: JSON.stringify({ deploymentId }),
    logScopeHash: scopeHash,
  });
  await seedCatalog(paths, localCatalogSeed(deploymentId, nft));
  return paths;
}

describe('Indexer store', () => {
  it('rolls back the full batch and requires recovery when an owned event lacks its prerequisite', async () => {
    const paths = await fixture();
    const first = header(1);
    const missingSale = event(first, 0, {
      kind: 'SaleFunded',
      saleId: '999',
      buyer,
      amountWei: '100',
      fundedAt: '1700000001',
      expiresAt: '1700000301',
    });
    const writer = await openProjectionWriter(paths);
    const store = new SqliteProjectionStore(writer.database, deploymentId, nft, scopeHash);

    await expect(store.commit([first], [missingSale], first)).rejects.toThrow(
      `PROJECTOR_INTEGRITY: deployment=${deploymentId} event=SaleFunded blockHash=${first.hash} ` +
        `transactionHash=${missingSale.transactionHash} logIndex=0 entity=sale:999 missing=SaleCreated`,
    );

    expect(writer.database.prepare('SELECT COUNT(*) AS count FROM indexed_blocks').get()).toEqual({
      count: 0,
    });
    expect(writer.database.prepare('SELECT COUNT(*) AS count FROM chain_events').get()).toEqual({
      count: 0,
    });
    expect(writer.database.prepare('SELECT COUNT(*) AS count FROM sales').get()).toEqual({
      count: 0,
    });
    expect(await store.checkpoint()).toBeNull();
    expect(
      writer.database
        .prepare(
          'SELECT projection_status AS projectionStatus,recovery_reason AS recoveryReason FROM indexer_runtime_status WHERE deployment_id=?',
        )
        .get(deploymentId),
    ).toEqual({ projectionStatus: 'RECOVERY_REQUIRED', recoveryReason: 'PROJECTOR_INTEGRITY' });
    await writer.close();
  });

  it('commits, verifies replay, rejects mismatches, and rebuilds atomically', async () => {
    const paths = await fixture();
    const first = header(1);
    const second = header(2);
    const events = [
      event(first, 0, { kind: 'Transfer', tokenId: '1', from: hex('0', 20), to: seller }, nft),
      event(first, 1, {
        kind: 'SaleCreated',
        saleId: '1',
        tokenId: '1',
        seller,
        priceWei: '1000000000000000000',
      }),
      event(second, 0, {
        kind: 'SaleFunded',
        saleId: '1',
        buyer,
        amountWei: '1000000000000000000',
        fundedAt: '1700000002',
        expiresAt: '1700000302',
      }),
    ] as const;

    let writer = await openProjectionWriter(paths);
    let store = new SqliteProjectionStore(writer.database, deploymentId, nft, scopeHash);
    await store.commit([first, second], events, second);
    await store.commit([first, second], events, second);

    const changedIdentity = [
      ...events.slice(0, 2),
      event(second, 0, {
        kind: 'SaleFunded',
        saleId: '1',
        buyer: seller,
        amountWei: '1000000000000000000',
        fundedAt: '1700000002',
        expiresAt: '1700000302',
      }),
    ];
    await expect(store.commit([first, second], changedIdentity, second)).rejects.toThrow(
      'EVENT_IDENTITY_CONTENT_MISMATCH',
    );

    await writer.close();

    let reader = await createReadOnlyReader(paths, deploymentId);
    const fundingSelector = {
      transactionHash: events[2].transactionHash,
      blockNumber: '2',
      blockHash: second.hash,
      logIndex: 0,
    };
    expect(reader.observeFunding('1', fundingSelector)).toMatchObject({
      data: {
        sale: { status: 'FUNDED', claim: null },
        observation: {
          coverage: 'SCANNED',
          eventLookup: 'MATCHED',
          matchedEvent: {
            saleId: '1',
            buyer,
            amountWei: '1000000000000000000',
          },
          projectionEffect: 'CONSISTENT',
        },
      },
      provenance: { indexedBlockNumber: '2', indexedBlockHash: second.hash },
    });
    expect(
      reader.observeFunding('1', {
        ...fundingSelector,
        transactionHash: hex('f', 32),
      }).data.observation,
    ).toMatchObject({ coverage: 'SCANNED', eventLookup: 'SELECTOR_MISMATCH' });
    expect(
      reader.observeFunding('1', {
        ...fundingSelector,
        blockNumber: '3',
        blockHash: hex('3', 32),
      }).data.observation,
    ).toMatchObject({ coverage: 'NOT_REACHED', projectionEffect: 'NOT_ASSESSED' });
    await reader.close();

    writer = await openProjectionWriter(paths);
    store = new SqliteProjectionStore(writer.database, deploymentId, nft, scopeHash);
    const third = header(3);
    const completionEvents = [
      event(third, 0, { kind: 'SaleCompleted', saleId: '1' }),
      event(third, 1, {
        kind: 'PaymentClaimCreated',
        saleId: '1',
        beneficiary: seller,
        amountWei: '1000000000000000000',
        claimKind: 'SELLER_PROCEEDS',
      }),
    ] as const;
    let committedDuringObservation = false;
    const snapshotReader = await createReadOnlyReader(paths, deploymentId, {
      afterFundingBaseRead: () => {
        if (committedDuringObservation) return;
        committedDuringObservation = true;
        void store.commit([third], completionEvents, third);
      },
    });
    expect(snapshotReader.observeFunding('1', fundingSelector)).toMatchObject({
      data: {
        sale: { status: 'FUNDED', claim: null },
        observation: { eventLookup: 'MATCHED', projectionEffect: 'CONSISTENT' },
      },
      provenance: { indexedBlockNumber: '2', indexedBlockHash: second.hash },
    });
    expect(committedDuringObservation).toBe(true);
    await snapshotReader.close();

    const fourth = header(4);
    await expect(
      store.commit([fourth], [event(fourth, 0, { kind: 'SaleCancelled', saleId: '1' })], fourth),
    ).rejects.toThrow('SaleCancelled requires LISTED');

    const rebuild = store.rebuildFromJournal();
    expect(rebuild.events).toBe(5);
    await writer.close();

    reader = await createReadOnlyReader(paths, deploymentId);
    const sale = reader.getSale('1');
    expect(sale.data).toMatchObject({
      status: 'COMPLETED',
      metadataStatus: 'AVAILABLE',
      catalogId: 'apex-gt',
      claim: { status: 'CLAIMABLE', beneficiary: seller },
    });
    expect(sale.provenance).toMatchObject({
      indexedBlockNumber: '3',
      projectionBuildId: rebuild.projectionBuildId,
      logScopeHash: scopeHash,
    });
    expect(reader.observeFunding('1', fundingSelector).data.observation).toMatchObject({
      coverage: 'SCANNED',
      eventLookup: 'MATCHED',
      projectionEffect: 'CONSISTENT',
    });
    await reader.close();

    writer = await openProjectionWriter(paths);
    store = new SqliteProjectionStore(writer.database, deploymentId, nft, scopeHash);
    const checkpoint = await store.checkpoint();
    expect(checkpoint?.number).toBe(3n);
    expect(store.hasCanonicalBlock(4n, fourth.hash)).toBe(false);
    await writer.close();
  });

  it('rejects a new log discovered in a completed block', async () => {
    const paths = await fixture();
    const first = header(1);
    const base = event(first, 0, {
      kind: 'SaleCreated',
      saleId: '1',
      tokenId: '1',
      seller,
      priceWei: '1',
    });
    const writer = await openProjectionWriter(paths);
    const store = new SqliteProjectionStore(writer.database, deploymentId, nft, scopeHash);
    await store.commit([first], [base], first);
    await expect(
      store.commit([first], [base, event(first, 1, { kind: 'SaleCancelled', saleId: '1' })], first),
    ).rejects.toThrow('COMPLETED_BLOCK_CONTENT_MISMATCH');
    await writer.close();
  });

  it('blocks incremental ingestion when the stored projector version differs', async () => {
    const paths = await fixture();
    const writer = await openProjectionWriter(paths);
    writer.database
      .prepare('UPDATE indexer_checkpoint SET projector_version=? WHERE deployment_id=?')
      .run('incompatible-projector', deploymentId);
    expect(() => new SqliteProjectionStore(writer.database, deploymentId, nft, scopeHash)).toThrow(
      'PROJECTION_CONTRACT_MISMATCH',
    );
    await writer.close();
  });

  it('refuses rebuild when a completed block is missing a source event and preserves projection', async () => {
    const paths = await fixture();
    const first = header(1);
    const writer = await openProjectionWriter(paths);
    const store = new SqliteProjectionStore(writer.database, deploymentId, nft, scopeHash);
    await store.commit(
      [first],
      [
        event(first, 0, {
          kind: 'SaleCreated',
          saleId: '1',
          tokenId: '1',
          seller,
          priceWei: '100',
        }),
      ],
      first,
    );
    writer.database
      .prepare('DELETE FROM chain_events WHERE deployment_id=? AND block_hash=?')
      .run(deploymentId, first.hash);

    expect(() => store.rebuildFromJournal()).toThrow('REBUILD_SOURCE_INCOMPLETE');
    expect(
      writer.database
        .prepare('SELECT status FROM sales WHERE deployment_id=? AND sale_id=?')
        .get(deploymentId, '1'),
    ).toEqual({ status: 'LISTED' });
    expect(
      writer.database
        .prepare(
          'SELECT projection_status AS projectionStatus,recovery_reason AS recoveryReason FROM indexer_runtime_status WHERE deployment_id=?',
        )
        .get(deploymentId),
    ).toEqual({
      projectionStatus: 'RECOVERY_REQUIRED',
      recoveryReason: 'REBUILD_SOURCE_INCOMPLETE',
    });
    await writer.close();
  });

  it('refuses rebuild when decoded source evidence changes and preserves projection', async () => {
    const paths = await fixture();
    const first = header(1);
    const writer = await openProjectionWriter(paths);
    const store = new SqliteProjectionStore(writer.database, deploymentId, nft, scopeHash);
    await store.commit(
      [first],
      [
        event(first, 0, {
          kind: 'SaleCreated',
          saleId: '1',
          tokenId: '1',
          seller,
          priceWei: '100',
        }),
      ],
      first,
    );
    writer.database
      .prepare('UPDATE chain_events SET decoded_json=? WHERE deployment_id=? AND block_hash=?')
      .run(
        JSON.stringify({
          kind: 'SaleCreated',
          saleId: '1',
          tokenId: '1',
          seller,
          priceWei: '999',
        }),
        deploymentId,
        first.hash,
      );

    expect(() => store.rebuildFromJournal()).toThrow('REBUILD_SOURCE_INCOMPLETE');
    expect(
      writer.database
        .prepare('SELECT price_wei AS priceWei FROM sales WHERE deployment_id=? AND sale_id=?')
        .get(deploymentId, '1'),
    ).toEqual({ priceWei: '100' });
    await writer.close();
  });

  it('allows maintenance rebuild from an explicitly supported prior projector version', async () => {
    const paths = await fixture();
    const writer = await openProjectionWriter(paths);
    writer.database
      .prepare('UPDATE indexer_checkpoint SET projector_version=? WHERE deployment_id=?')
      .run('0', deploymentId);

    expect(() => new SqliteProjectionStore(writer.database, deploymentId, nft, scopeHash)).toThrow(
      'PROJECTION_CONTRACT_MISMATCH',
    );
    const maintenance = SqliteProjectionStore.forMaintenance(
      writer.database,
      deploymentId,
      nft,
      scopeHash,
      { supportedProjectorVersions: ['0'] },
    );
    expect(maintenance.rebuildFromJournal().events).toBe(0);
    expect(
      writer.database
        .prepare(
          'SELECT projector_version AS projectorVersion FROM indexer_checkpoint WHERE deployment_id=?',
        )
        .get(deploymentId),
    ).toEqual({ projectorVersion: '1' });
    await writer.close();
  });

  it('rebuilds a verified empty block without removing catalog data', async () => {
    const paths = await fixture();
    const first = header(1);
    const writer = await openProjectionWriter(paths);
    const store = new SqliteProjectionStore(writer.database, deploymentId, nft, scopeHash);
    await store.commit([first], [], first);
    const catalogBefore = writer.database
      .prepare('SELECT COUNT(*) AS count FROM catalog_vehicles')
      .get();

    expect(store.rebuildFromJournal()).toMatchObject({ events: 0 });
    expect(writer.database.prepare('SELECT COUNT(*) AS count FROM catalog_vehicles').get()).toEqual(
      catalogBefore,
    );
    await writer.close();
  });

  it('does not clear recovery-required status during an idle health update', async () => {
    const paths = await fixture();
    const writer = await openProjectionWriter(paths);
    const store = new SqliteProjectionStore(writer.database, deploymentId, nft, scopeHash);
    await store.markRecoveryRequired('CHECKPOINT_HASH_CHANGED');
    store.observe(5n);
    await store.markCurrent(5n);

    expect(
      writer.database
        .prepare(
          'SELECT projection_status AS projectionStatus,recovery_reason AS recoveryReason FROM indexer_runtime_status WHERE deployment_id=?',
        )
        .get(deploymentId),
    ).toEqual({
      projectionStatus: 'RECOVERY_REQUIRED',
      recoveryReason: 'CHECKPOINT_HASH_CHANGED',
    });
    await writer.close();
  });

  it('keeps unsupported projector and scope transitions fail-closed in maintenance mode', async () => {
    const paths = await fixture();
    const writer = await openProjectionWriter(paths);
    writer.database
      .prepare(
        'UPDATE indexer_checkpoint SET projector_version=?,log_scope_hash=? WHERE deployment_id=?',
      )
      .run('unsupported', hex('9', 32), deploymentId);

    expect(() =>
      SqliteProjectionStore.forMaintenance(writer.database, deploymentId, nft, scopeHash, {
        supportedProjectorVersions: ['0'],
        allowLogScopeChange: true,
      }),
    ).toThrow('MAINTENANCE_PROJECTION_CONTRACT_UNSUPPORTED');
    await writer.close();
  });

  it('reacquires source from deployment start when the log scope changes', async () => {
    const paths = await fixture();
    const first = header(1);
    const source = event(first, 0, {
      kind: 'SaleCreated',
      saleId: '1',
      tokenId: '1',
      seller,
      priceWei: '100',
    });
    const writer = await openProjectionWriter(paths);
    const initial = new SqliteProjectionStore(writer.database, deploymentId, nft, scopeHash);
    await initial.commit([first], [source], first);
    const previousScope = hex('8', 32);
    writer.database
      .prepare('UPDATE indexer_checkpoint SET log_scope_hash=? WHERE deployment_id=?')
      .run(previousScope, deploymentId);
    writer.database
      .prepare('UPDATE indexed_blocks SET log_scope_hash=? WHERE deployment_id=?')
      .run(previousScope, deploymentId);

    const maintenance = SqliteProjectionStore.forMaintenance(
      writer.database,
      deploymentId,
      nft,
      scopeHash,
      { allowLogScopeChange: true },
    );
    expect(() => maintenance.prepareForReindex(1n)).toThrow('SOURCE_REFRESH_ARCHIVE_REQUIRED');
    maintenance.prepareForReindex(1n, { verifiedBackupId: 'verified-scope-refresh' });
    expect(maintenance.rebuildFromJournal()).toMatchObject({ events: 0 });
    await maintenance.commit([first], [source], first);
    expect(
      writer.database
        .prepare('SELECT log_scope_hash AS logScopeHash FROM indexed_blocks WHERE deployment_id=?')
        .get(deploymentId),
    ).toEqual({ logScopeHash: scopeHash });
    await writer.close();
  });

  it('reacquires source from deployment start after a prior schema left source digests empty', async () => {
    const paths = await fixture();
    const first = header(1);
    const source = event(first, 0, {
      kind: 'SaleCreated',
      saleId: '1',
      tokenId: '1',
      seller,
      priceWei: '100',
    });
    const writer = await openProjectionWriter(paths);
    const initial = new SqliteProjectionStore(writer.database, deploymentId, nft, scopeHash);
    await initial.commit([first], [source], first);
    writer.database
      .prepare('UPDATE chain_events SET source_record_digest=NULL WHERE deployment_id=?')
      .run(deploymentId);
    writer.database
      .prepare('UPDATE indexed_blocks SET is_canonical=0 WHERE deployment_id=?')
      .run(deploymentId);
    writer.database
      .prepare('UPDATE indexer_checkpoint SET projector_version=? WHERE deployment_id=?')
      .run('0', deploymentId);
    writeFileSync(paths.deploymentPath, `${JSON.stringify({ deploymentId })}\n`);
    const backup = await backupEnvironment(paths, {
      locksAlreadyHeld: true,
      reason: 'test-pre-source-refresh',
    });
    verifyBackup(paths, backup.backupId);
    const archive = new Database(join(backup.path, 'database.sqlite'), {
      readonly: true,
      fileMustExist: true,
    });
    expect(
      archive
        .prepare(
          `SELECT COUNT(*) AS events,
                  SUM(CASE WHEN b.is_canonical=0 THEN 1 ELSE 0 END) AS orphanEvents
           FROM chain_events e
           JOIN indexed_blocks b
             ON b.deployment_id=e.deployment_id AND b.block_hash=e.block_hash
           WHERE e.deployment_id=?`,
        )
        .get(deploymentId),
    ).toEqual({ events: 1, orphanEvents: 1 });
    archive.close();

    const maintenance = SqliteProjectionStore.forMaintenance(
      writer.database,
      deploymentId,
      nft,
      scopeHash,
      { supportedProjectorVersions: ['0'] },
    );
    expect(() => maintenance.prepareForReindex(1n)).toThrow('SOURCE_REFRESH_ARCHIVE_REQUIRED');
    maintenance.prepareForReindex(1n, { verifiedBackupId: backup.backupId });
    expect(maintenance.rebuildFromJournal()).toMatchObject({ events: 0 });
    await maintenance.commit([first], [source], first);
    const refreshed = writer.database
      .prepare(
        'SELECT source_record_digest AS sourceRecordDigest FROM chain_events WHERE deployment_id=?',
      )
      .get(deploymentId) as { sourceRecordDigest: string | null } | undefined;
    expect(refreshed?.sourceRecordDigest).toMatch(/^0x[0-9a-f]{64}$/);
    await writer.close();
  });
});
