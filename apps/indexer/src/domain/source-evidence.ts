import { createHash } from 'node:crypto';
import type { OrderedEvent } from './events.js';

export const DECODER_VERSION = 'motorcove-events-v2';

export interface RawEventIdentity {
  readonly blockNumber: bigint;
  readonly blockHash: `0x${string}`;
  readonly transactionHash: `0x${string}`;
  readonly transactionIndex: number;
  readonly logIndex: number;
  readonly contractAddress: `0x${string}`;
  readonly topics: readonly `0x${string}`[];
  readonly data: `0x${string}`;
}

export const evidenceStringify = (value: unknown) =>
  JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item,
  );

export const evidenceDigest = (value: unknown): `0x${string}` =>
  `0x${createHash('sha256').update(evidenceStringify(value)).digest('hex')}`;

export const eventEnvelope = (ordered: RawEventIdentity) => ({
  blockNumber: ordered.blockNumber,
  blockHash: ordered.blockHash.toLowerCase(),
  transactionHash: ordered.transactionHash.toLowerCase(),
  transactionIndex: ordered.transactionIndex,
  logIndex: ordered.logIndex,
  contractAddress: ordered.contractAddress.toLowerCase(),
  topics: ordered.topics.map((topic) => topic.toLowerCase()),
  data: ordered.data.toLowerCase(),
});

export const sourceRecordDigest = (ordered: OrderedEvent): `0x${string}` =>
  evidenceDigest({
    envelope: eventEnvelope(ordered),
    decoded: ordered.event,
    decoderVersion: DECODER_VERSION,
  });
