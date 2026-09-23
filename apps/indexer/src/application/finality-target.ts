import type { ChainProfile } from '@motorcove/chain-artifacts/profiles';
import type { BlockHeader, ChainReader } from '../ports/index.js';

export interface ProjectionTargetObservation {
  readonly observedHead: BlockHeader;
  readonly eligibleHead: BlockHeader | null;
}

export async function readProjectionTarget(
  chain: Pick<ChainReader, 'getHead' | 'getBlock' | 'getFinalizedHead'>,
  profile: ChainProfile,
  indexingDepth: bigint,
): Promise<ProjectionTargetObservation> {
  if (indexingDepth < 0n) throw new Error('INDEXING_DEPTH_INVALID');
  if (profile.finality.kind === 'RPC_FINALIZED' && indexingDepth !== 0n)
    throw new Error('PUBLIC_INDEXING_DEPTH_UNSUPPORTED');

  const observedHead = await chain.getHead();
  if (profile.finality.kind === 'IMMEDIATE') {
    const eligibleHead =
      observedHead.number < indexingDepth
        ? null
        : indexingDepth === 0n
          ? observedHead
          : await chain.getBlock(observedHead.number - indexingDepth);
    return { observedHead, eligibleHead };
  }

  if (!chain.getFinalizedHead) throw new Error('PROVIDER_CAPABILITY_UNAVAILABLE: finalized tag');
  const eligibleHead = await chain.getFinalizedHead();
  if (eligibleHead.number > observedHead.number)
    throw new Error('FINALIZED_HEAD_EXCEEDS_OBSERVED_HEAD');
  const canonicalAtHeight = await chain.getBlock(eligibleHead.number);
  if (canonicalAtHeight.hash !== eligibleHead.hash) throw new Error('FINALIZED_BLOCK_HASH_CHANGED');
  return { observedHead, eligibleHead };
}
