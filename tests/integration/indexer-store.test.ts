import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  environmentPaths,
  migrateEnvironment,
  registerDeployment,
  seedCatalog,
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
});
