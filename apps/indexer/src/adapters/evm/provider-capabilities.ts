import type { PublicClient } from 'viem';
import { motorCoveEscrowAbi } from '@motorcove/chain-artifacts';
import type { DeploymentManifest } from '@motorcove/chain-artifacts/manifest';
import type { ChainProfile } from '@motorcove/chain-artifacts/profiles';

export interface ProviderCapabilities {
  readonly chainId: number;
  readonly blockHashLogs: 'SUPPORTED' | 'UNSUPPORTED';
  readonly finalizedTag: 'SUPPORTED' | 'UNSUPPORTED' | 'NOT_REQUIRED';
  readonly historicalState: 'SUPPORTED' | 'UNSUPPORTED';
}

export async function probeProviderCapabilities(
  client: PublicClient,
  manifest: DeploymentManifest,
  profile: ChainProfile,
): Promise<ProviderCapabilities> {
  const chainId = await client.getChainId();
  const [logs, finalized, historical] = await Promise.allSettled([
    client.getLogs({
      address: [manifest.nft.address as `0x${string}`, manifest.escrow.address as `0x${string}`],
      blockHash: manifest.escrow.blockHash as `0x${string}`,
    }),
    profile.finality.kind === 'RPC_FINALIZED'
      ? client.getBlock({ blockTag: 'finalized' })
      : Promise.resolve(null),
    client.readContract({
      address: manifest.escrow.address as `0x${string}`,
      abi: motorCoveEscrowAbi,
      functionName: 'deploymentId',
      blockNumber: BigInt(manifest.escrow.blockNumber),
    }),
  ]);

  return {
    chainId,
    blockHashLogs: logs.status === 'fulfilled' ? 'SUPPORTED' : 'UNSUPPORTED',
    finalizedTag:
      profile.finality.kind === 'IMMEDIATE'
        ? 'NOT_REQUIRED'
        : finalized.status === 'fulfilled' && finalized.value?.hash
          ? 'SUPPORTED'
          : 'UNSUPPORTED',
    historicalState: historical.status === 'fulfilled' ? 'SUPPORTED' : 'UNSUPPORTED',
  };
}

export function assertProviderCapabilities(
  capabilities: ProviderCapabilities,
  profile: ChainProfile,
): void {
  if (capabilities.chainId !== profile.chainId)
    throw new Error(`DEPLOYMENT_MISMATCH: chain id ${capabilities.chainId}`);
  const missing = [
    capabilities.blockHashLogs !== 'SUPPORTED' && 'block-hash logs',
    profile.providerRequirements.finalizedTag &&
      capabilities.finalizedTag !== 'SUPPORTED' &&
      'finalized tag',
    profile.providerRequirements.historicalStateForReconciliation &&
      capabilities.historicalState !== 'SUPPORTED' &&
      'historical contract state',
  ].filter(Boolean);
  if (missing.length > 0) throw new Error(`PROVIDER_CAPABILITY_UNAVAILABLE: ${missing.join(', ')}`);
}
