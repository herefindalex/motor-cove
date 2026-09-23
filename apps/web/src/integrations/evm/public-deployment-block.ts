import type { PublicConfig } from '@motorcove/api-contracts';
import { motorCoveEscrowAbi } from '@motorcove/chain-artifacts';
import type { Address, PublicClient } from 'viem';

/** Bind a public RPC observation to the configured chain and escrow generation. */
export async function readPublicDeploymentBlock(client: PublicClient, config: PublicConfig) {
  if ((await client.getChainId()) !== Number(config.chainId)) {
    throw new Error('PUBLIC_CHAIN_MISMATCH');
  }
  const block = await client.getBlock();
  if (!block.hash) throw new Error('PUBLIC_BLOCK_UNCONFIRMED');
  const deploymentId = await client.readContract({
    address: config.escrowAddress as Address,
    abi: motorCoveEscrowAbi,
    functionName: 'deploymentId',
    blockNumber: block.number,
  });
  if (deploymentId.toLowerCase() !== config.deploymentId.toLowerCase()) {
    throw new Error('PUBLIC_DEPLOYMENT_MISMATCH');
  }
  return block;
}

export async function assertPublicBlockUnchanged(
  client: PublicClient,
  config: PublicConfig,
  block: Awaited<ReturnType<typeof readPublicDeploymentBlock>>,
): Promise<void> {
  if ((await client.getChainId()) !== Number(config.chainId)) {
    throw new Error('PUBLIC_CHAIN_MISMATCH');
  }
  const current = await client.getBlock({ blockNumber: block.number });
  if (current.hash !== block.hash) throw new Error('PUBLIC_BLOCK_CHANGED');
}
