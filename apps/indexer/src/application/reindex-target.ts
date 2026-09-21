import type { BlockHeader } from '../ports/index.js';

export interface ReindexTargetReader {
  getHead(): Promise<BlockHeader>;
  getBlock(number: bigint): Promise<BlockHeader>;
}

export async function resolveEligibleReindexTarget(
  chain: ReindexTargetReader,
  indexingDepth: bigint,
): Promise<BlockHeader | null> {
  if (indexingDepth < 0n) throw new Error('INDEXING_DEPTH_INVALID');
  const head = await chain.getHead();
  if (head.number < indexingDepth) return null;
  const targetNumber = head.number - indexingDepth;
  const first = await chain.getBlock(targetNumber);
  const confirmation = await chain.getBlock(targetNumber);
  if (first.hash !== confirmation.hash || first.number !== confirmation.number)
    throw new Error('REINDEX_TARGET_CHANGED');
  return confirmation;
}
