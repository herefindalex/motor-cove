import { chainProfileForId, type ChainProfile } from '@motorcove/chain-artifacts/profiles';
import type { BlockHeader } from '../ports/index.js';
import { readProjectionTarget } from './finality-target.js';

export interface ReindexTargetReader {
  getHead(): Promise<BlockHeader>;
  getFinalizedHead?(): Promise<BlockHeader>;
  getBlock(number: bigint): Promise<BlockHeader>;
}

export interface ReindexResumeMarker {
  readonly reindexFromBlock?: string;
  readonly targetBlock?: string;
  readonly targetHash?: string;
}

export interface ReindexOperationRecovery {
  readonly reindexFromBlock: string;
  readonly targetBlock: string;
  readonly targetHash: string;
}

export async function resolveEligibleReindexTarget(
  chain: ReindexTargetReader,
  indexingDepth: bigint,
  profile: ChainProfile = chainProfileForId(31337),
): Promise<BlockHeader | null> {
  const observation = await readProjectionTarget(chain, profile, indexingDepth);
  if (!observation.eligibleHead) return null;
  const targetNumber = observation.eligibleHead.number;
  const first = await chain.getBlock(targetNumber);
  const confirmation = await chain.getBlock(targetNumber);
  if (first.hash !== confirmation.hash || first.number !== confirmation.number)
    throw new Error('REINDEX_TARGET_CHANGED');
  return confirmation;
}

export async function resolveReindexOperationRecovery(
  chain: ReindexTargetReader,
  indexingDepth: bigint,
  fromBlock: bigint,
  existing?: ReindexResumeMarker,
  profile: ChainProfile = chainProfileForId(31337),
): Promise<ReindexOperationRecovery> {
  if (existing) {
    if (
      existing.reindexFromBlock !== fromBlock.toString() ||
      existing.targetBlock === undefined ||
      existing.targetHash === undefined ||
      !/^\d+$/.test(existing.targetBlock)
    )
      throw new Error('MAINTENANCE_INCOMPLETE');
    const targetNumber = BigInt(existing.targetBlock);
    const first = await chain.getBlock(targetNumber);
    const confirmation = await chain.getBlock(targetNumber);
    if (
      first.number !== targetNumber ||
      confirmation.number !== targetNumber ||
      first.hash !== confirmation.hash ||
      confirmation.hash.toLowerCase() !== existing.targetHash.toLowerCase()
    )
      throw new Error('REINDEX_TARGET_CHANGED');
    return {
      reindexFromBlock: existing.reindexFromBlock,
      targetBlock: existing.targetBlock,
      targetHash: existing.targetHash,
    };
  }

  const target = await resolveEligibleReindexTarget(chain, indexingDepth, profile);
  if (!target) throw new Error('REINDEX_TARGET_NOT_AVAILABLE');
  return {
    reindexFromBlock: fromBlock.toString(),
    targetBlock: target.number.toString(),
    targetHash: target.hash,
  };
}
