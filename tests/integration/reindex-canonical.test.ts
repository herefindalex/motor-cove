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
const hex = (character: string, bytes: number) => `0x${character.repeat(bytes * 2)}`;
const deploymentId = hex('a', 32);
const nft = hex('b', 20);
const escrow = hex('c', 20);
const seller = hex('d', 20);
const buyer = hex('e', 20);
const scopeHash = hex('1', 32);

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const header = (number: number, branch = String(number)): BlockHeader => ({
  number: BigInt(number),
  hash: hex(branch, 32) as `0x${string}`,
  parentHash: hex(String(Math.max(0, number - 1)), 32) as `0x${string}`,
  timestamp: BigInt(1_700_000_000 + number),
});

const event = (
  block: BlockHeader,
  logIndex: number,
  normalized: OrderedEvent['event'],
): OrderedEvent => ({
  blockNumber: block.number,
  blockHash: block.hash,
  transactionHash: hex(String(logIndex + 3), 32) as `0x${string}`,
  transactionIndex: 0,
  logIndex,
  contractAddress: escrow as `0x${string}`,
  topics: [],
  data: '0x',
  event: normalized,
});

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'motorcove-reindex-canonical-'));
  roots.push(root);
  const paths = environmentPaths(root, 'reindex');
  await migrateEnvironment(paths);
  await registerDeployment(paths, {
    deploymentId,
    chainId: '31337',
    nftAddress: nft,
    escrowAddress: escrow,
    protocolVersion: '0.2.0',
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

describe('same-history reindex', () => {
  it('recanonicalizes existing source blocks and reapplies their events to a fresh projection', async () => {
    const paths = await fixture();
    const first = header(1);
    const second = header(2);
    const events = [
      event(first, 0, {
        kind: 'Transfer',
        tokenId: '1',
        from: hex('0', 20),
        to: seller,
      }),
      event(first, 1, {
        kind: 'SaleCreated',
        saleId: '1',
        tokenId: '1',
        seller,
        allowedBuyer: buyer,
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

    const writer = await openProjectionWriter(paths);
    const store = new SqliteProjectionStore(writer.database, deploymentId, nft, scopeHash);
    await store.commit([first, second], events, second);

    for (let pass = 0; pass < 2; pass += 1) {
      store.rewindFrom(1n);
      expect(store.rebuildFromJournal().events).toBe(0);
      await store.commit([first, second], events, second);
      await expect(store.checkpoint()).resolves.toMatchObject({ number: 2n, hash: second.hash });
      expect(store.hasCanonicalBlock(1n, first.hash)).toBe(true);
      expect(store.hasCanonicalBlock(2n, second.hash)).toBe(true);
    }
    await writer.close();

    const reader = await createReadOnlyReader(paths, deploymentId);
    expect(reader.getSale('1').data).toMatchObject({ status: 'FUNDED', buyer });
    expect(reader.recentEvents(100).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventName: 'SaleFunded',
          canonical: true,
          scanComplete: true,
          sourceLogScopeHash: scopeHash,
        }),
      ]),
    );
    await reader.close();
  });
});
