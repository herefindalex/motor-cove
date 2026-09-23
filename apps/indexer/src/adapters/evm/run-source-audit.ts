import { keccak256, type PublicClient } from 'viem';
import { motorCoveEscrowAbi } from '@motorcove/chain-artifacts';
import type { DeploymentManifest } from '@motorcove/chain-artifacts/manifest';
import type { ChainProfile } from '@motorcove/chain-artifacts/profiles';
import type { ReadModelReader } from '@motorcove/database/reader';
import { type RawEventIdentity } from '../../domain/source-evidence.js';
import {
  compareSourceEvidence,
  type SecondaryAuditBlock,
  type SourceAuditMismatch,
} from '../../application/source-audit.js';
import { logScopeHash } from '../../runtime/config.js';

export interface SourceAuditReport {
  readonly deploymentId: string;
  readonly chainProfile: ChainProfile['key'];
  readonly range: { readonly from: string; readonly to: string };
  readonly finalizedAnchor: { readonly number: string; readonly hash: string } | null;
  readonly primaryEvidenceDigest: string | null;
  readonly secondaryEvidenceDigest: string | null;
  readonly mismatches: readonly SourceAuditMismatch[];
  readonly providers: { readonly primary: string; readonly secondary: string };
  readonly observedAt: string;
  readonly result: 'MATCH' | 'MISMATCH' | 'UNVERIFIABLE';
  readonly reason?: string;
}

function endpointIdentity(value: string): string {
  const url = new URL(value);
  return `${url.origin.toLowerCase()}${url.pathname.replace(/\/$/, '')}`;
}

function endpointLabel(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return 'INVALID_ENDPOINT';
  }
}

function requireHash(value: `0x${string}` | null | undefined, reason: string): `0x${string}` {
  if (!value) throw new Error(reason);
  return value;
}

export async function runSourceAudit(options: {
  readonly reader: Pick<ReadModelReader, 'deploymentDescriptor' | 'sourceAuditRange'>;
  readonly secondary: PublicClient;
  readonly manifest: DeploymentManifest;
  readonly profile: ChainProfile;
  readonly primaryRpcUrl: string;
  readonly secondaryRpcUrl: string;
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
  readonly now?: () => Date;
}): Promise<SourceAuditReport> {
  const {
    reader,
    secondary,
    manifest,
    profile,
    primaryRpcUrl,
    secondaryRpcUrl,
    fromBlock,
    toBlock,
  } = options;
  const base = {
    deploymentId: manifest.deploymentId,
    chainProfile: profile.key,
    range: { from: fromBlock.toString(), to: toBlock.toString() },
    providers: {
      primary: endpointLabel(primaryRpcUrl),
      secondary: endpointLabel(secondaryRpcUrl),
    },
    observedAt: (options.now?.() ?? new Date()).toISOString(),
  };
  const unverifiable = (reason: string): SourceAuditReport => ({
    ...base,
    finalizedAnchor: null,
    primaryEvidenceDigest: null,
    secondaryEvidenceDigest: null,
    mismatches: [],
    result: 'UNVERIFIABLE',
    reason,
  });
  if (fromBlock < 0n || toBlock < fromBlock || toBlock > BigInt(Number.MAX_SAFE_INTEGER))
    return unverifiable('SOURCE_AUDIT_RANGE_INVALID');
  if (toBlock - fromBlock > 1_000n) return unverifiable('SOURCE_AUDIT_RANGE_TOO_LARGE');
  try {
    if (endpointIdentity(primaryRpcUrl) === endpointIdentity(secondaryRpcUrl))
      return unverifiable('SECONDARY_ENDPOINT_NOT_INDEPENDENT');
    const descriptor = reader.deploymentDescriptor();
    if (
      descriptor.deploymentId.toLowerCase() !== manifest.deploymentId.toLowerCase() ||
      descriptor.chainId !== manifest.chainId ||
      descriptor.nftAddress.toLowerCase() !== manifest.nft.address.toLowerCase() ||
      descriptor.escrowAddress.toLowerCase() !== manifest.escrow.address.toLowerCase()
    )
      return unverifiable('PRIMARY_DESCRIPTOR_MISMATCH');

    const chainId = await secondary.getChainId();
    if (chainId !== profile.chainId || String(chainId) !== manifest.chainId)
      return unverifiable('IDENTITY_MISMATCH: chain id');
    const escrow = manifest.escrow.address as `0x${string}`;
    const nft = manifest.nft.address as `0x${string}`;
    const [deploymentId, nftCode, escrowCode] = await Promise.all([
      secondary.readContract({
        address: escrow,
        abi: motorCoveEscrowAbi,
        functionName: 'deploymentId',
      }),
      secondary.getCode({ address: nft }),
      secondary.getCode({ address: escrow }),
    ]);
    if (
      deploymentId.toLowerCase() !== manifest.deploymentId.toLowerCase() ||
      !nftCode ||
      !escrowCode ||
      keccak256(nftCode).toLowerCase() !== manifest.nft.runtimeCodeHash.toLowerCase() ||
      keccak256(escrowCode).toLowerCase() !== manifest.escrow.runtimeCodeHash.toLowerCase()
    )
      return unverifiable('IDENTITY_MISMATCH: deployment runtime');

    const finalized = await secondary.getBlock(
      profile.finality.kind === 'RPC_FINALIZED' ? { blockTag: 'finalized' } : {},
    );
    const finalizedHash = requireHash(finalized.hash, 'FINALIZED_HEAD_UNAVAILABLE');
    if (toBlock > finalized.number) return unverifiable('AUDIT_RANGE_NOT_FINALIZED');
    const snapshot = reader.sourceAuditRange(fromBlock.toString(), toBlock.toString());
    if (BigInt(snapshot.provenance.indexedBlockNumber) < toBlock)
      return unverifiable('LOCAL_CHECKPOINT_BEFORE_AUDIT_RANGE');
    const expectedScope = logScopeHash(manifest);
    if (snapshot.provenance.logScopeHash.toLowerCase() !== expectedScope.toLowerCase())
      return unverifiable('PRIMARY_SCOPE_MISMATCH');

    const secondaryBlocks: SecondaryAuditBlock[] = [];
    for (let number = fromBlock; number <= toBlock; number += 1n) {
      const block = await secondary.getBlock({ blockNumber: number });
      const hash = requireHash(block.hash, 'SECONDARY_BLOCK_UNAVAILABLE');
      const logs = await secondary.getLogs({ address: [nft, escrow], blockHash: hash });
      const events: RawEventIdentity[] = logs.map((log) => {
        if (
          log.blockNumber !== number ||
          log.blockHash?.toLowerCase() !== hash.toLowerCase() ||
          log.transactionHash === null ||
          log.transactionIndex === null ||
          log.logIndex === null ||
          ![nft.toLowerCase(), escrow.toLowerCase()].includes(log.address.toLowerCase())
        )
          throw new Error('SECONDARY_LOG_IDENTITY_INVALID');
        return {
          blockNumber: number,
          blockHash: hash,
          transactionHash: log.transactionHash,
          transactionIndex: log.transactionIndex,
          logIndex: log.logIndex,
          contractAddress: log.address,
          topics: log.topics,
          data: log.data,
        };
      });
      secondaryBlocks.push({ number, hash, parentHash: block.parentHash, events });
    }
    const comparison = compareSourceEvidence(
      snapshot.data,
      secondaryBlocks,
      fromBlock,
      toBlock,
      expectedScope,
    );
    return {
      ...base,
      finalizedAnchor: { number: finalized.number.toString(), hash: finalizedHash },
      primaryEvidenceDigest: comparison.primaryEvidenceDigest,
      secondaryEvidenceDigest: comparison.secondaryEvidenceDigest,
      mismatches: comparison.mismatches,
      result: comparison.result,
    };
  } catch (error) {
    const stableReasons = new Set([
      'FINALIZED_HEAD_UNAVAILABLE',
      'SECONDARY_BLOCK_UNAVAILABLE',
      'SECONDARY_LOG_IDENTITY_INVALID',
    ]);
    const reason =
      error instanceof Error && stableReasons.has(error.message)
        ? error.message
        : 'SOURCE_AUDIT_UNAVAILABLE';
    return unverifiable(reason);
  }
}
