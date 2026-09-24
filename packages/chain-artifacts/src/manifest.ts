import { z } from 'zod';

/** Breaking escrow call and event contract for reserved-buyer sales. */
export const protocolVersion = '0.2.0' as const;

const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const deployedContract = z.object({
  address,
  transactionHash: hash,
  blockNumber: z.string().regex(/^\d+$/),
  blockHash: hash,
  runtimeCodeHash: hash,
  abiHash: hash,
});

export const deploymentManifestSchema = z.object({
  manifestVersion: z.literal(1),
  deploymentId: hash,
  chainId: z.string().regex(/^\d+$/),
  protocolVersion: z.literal(protocolVersion),
  compiler: z.string(),
  buildId: z.string(),
  scanStartBlock: z.string().regex(/^\d+$/),
  fundingPeriodSeconds: z.string().regex(/^\d+$/),
  nft: deployedContract,
  escrow: deployedContract,
  demoAccounts: z
    .object({ deployer: address, seller: address, buyer: address, outsider: address })
    .optional(),
});

export type DeploymentManifest = z.infer<typeof deploymentManifestSchema>;
