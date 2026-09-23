import { closeSync, fsyncSync, openSync, writeFileSync } from 'node:fs';
import { environmentPaths } from '@motorcove/database/maintenance';
import { openProjectionWriter } from '@motorcove/database/projection-writer';
import {
  SqliteProjectionStore,
  type CommitFaultPoint,
} from '../../apps/indexer/src/adapters/sqlite/sqlite-projection-store.js';
import type { OrderedEvent } from '../../apps/indexer/src/domain/events.js';
import type { BlockHeader } from '../../apps/indexer/src/ports/index.js';

const [root, environment, requestedPoint, markerPath] = process.argv.slice(2);
if (!root || !environment || !requestedPoint || !markerPath) throw new Error('MISSING_ARGUMENT');
const point = requestedPoint as CommitFaultPoint;
const hex = (character: string, bytes: number): `0x${string}` => `0x${character.repeat(bytes * 2)}`;
const deploymentId = hex('a', 32);
const nft = hex('b', 20);
const escrow = hex('c', 20);
const seller = hex('d', 20);
const scopeHash = hex('1', 32);
const block: BlockHeader = {
  number: 1n,
  hash: hex('8', 32),
  parentHash: hex('7', 32),
  timestamp: 1_700_000_001n,
};
const events: OrderedEvent[] = [
  {
    blockNumber: block.number,
    blockHash: block.hash,
    transactionHash: hex('3', 32),
    transactionIndex: 0,
    logIndex: 1,
    contractAddress: nft,
    topics: [],
    data: '0x',
    event: { kind: 'Transfer', tokenId: '1', from: hex('0', 20), to: seller },
  },
  {
    blockNumber: block.number,
    blockHash: block.hash,
    transactionHash: hex('4', 32),
    transactionIndex: 1,
    logIndex: 0,
    contractAddress: escrow,
    topics: [],
    data: '0x',
    event: {
      kind: 'SaleCreated',
      saleId: '1',
      tokenId: '1',
      seller,
      allowedBuyer: hex('e', 20),
      priceWei: '1000000000000000000',
    },
  },
];

const writer = await openProjectionWriter(environmentPaths(root, environment));
const store = new SqliteProjectionStore(writer.database, deploymentId, nft, scopeHash, (at) => {
  if (at !== point) return;
  writeFileSync(markerPath, JSON.stringify({ pid: process.pid, point: at }));
  const handle = openSync(markerPath, 'r');
  fsyncSync(handle);
  closeSync(handle);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
});
await store.commit([block], events, block);
await writer.close();
