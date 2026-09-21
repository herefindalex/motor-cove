import type { OrderedEvent } from '../domain/events.js';
export interface BlockHeader {
  readonly number: bigint;
  readonly hash: `0x${string}`;
  readonly parentHash: `0x${string}`;
  readonly timestamp: bigint;
}
export interface ChainReader {
  getHead(): Promise<BlockHeader>;
  getBlock(number: bigint): Promise<BlockHeader>;
  getEvents(from: bigint, to: bigint): Promise<readonly OrderedEvent[]>;
}
export interface ProjectionUnitOfWork {
  checkpoint(): Promise<BlockHeader | null>;
  observe?(head: bigint): void;
  commit(
    headers: readonly BlockHeader[],
    events: readonly OrderedEvent[],
    checkpoint: BlockHeader,
  ): Promise<void>;
  markRecoveryRequired(reason: string): Promise<void>;
}
