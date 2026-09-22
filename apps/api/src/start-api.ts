import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  deploymentManifestSchema,
  type DeploymentManifest,
} from '@motorcove/chain-artifacts/manifest';
import { publicConfigSchema } from '@motorcove/api-contracts';
import type { DeploymentDescriptor, ReadModelReader } from '@motorcove/database/reader';
import { createApp } from './app/create-app.js';

const sha256 = (value: string): `0x${string}` =>
  `0x${createHash('sha256').update(value).digest('hex')}`;
const canonicalHex = (value: string) => value.toLowerCase();

export function assertDeploymentDescriptorMatchesManifest(
  descriptor: DeploymentDescriptor,
  manifest: DeploymentManifest,
): void {
  const databaseManifest = deploymentManifestSchema.parse(JSON.parse(descriptor.manifestJson));
  const expected = {
    deploymentId: canonicalHex(manifest.deploymentId),
    chainId: manifest.chainId,
    nftAddress: canonicalHex(manifest.nft.address),
    escrowAddress: canonicalHex(manifest.escrow.address),
    protocolVersion: manifest.protocolVersion,
    abiBundleHash: sha256(
      `${canonicalHex(manifest.nft.abiHash)}:${canonicalHex(manifest.escrow.abiHash)}`,
    ),
    scanStartBlock: Number(manifest.scanStartBlock),
    nftDeploymentBlock: Number(manifest.nft.blockNumber),
    nftDeploymentHash: canonicalHex(manifest.nft.blockHash),
    nftRuntimeCodeHash: canonicalHex(manifest.nft.runtimeCodeHash),
    escrowDeploymentBlock: Number(manifest.escrow.blockNumber),
    escrowDeploymentHash: canonicalHex(manifest.escrow.blockHash),
    escrowRuntimeCodeHash: canonicalHex(manifest.escrow.runtimeCodeHash),
  };
  const actual = {
    ...descriptor,
    deploymentId: canonicalHex(descriptor.deploymentId),
    nftAddress: canonicalHex(descriptor.nftAddress),
    escrowAddress: canonicalHex(descriptor.escrowAddress),
    nftDeploymentHash: canonicalHex(descriptor.nftDeploymentHash),
    nftRuntimeCodeHash: canonicalHex(descriptor.nftRuntimeCodeHash),
    escrowDeploymentHash: canonicalHex(descriptor.escrowDeploymentHash),
    escrowRuntimeCodeHash: canonicalHex(descriptor.escrowRuntimeCodeHash),
  };
  const mismatches = (Object.keys(expected) as Array<keyof typeof expected>).filter(
    (field) => actual[field] !== expected[field],
  );
  const normalizeManifest = (value: DeploymentManifest) => ({
    ...value,
    deploymentId: canonicalHex(value.deploymentId),
    nft: {
      ...value.nft,
      address: canonicalHex(value.nft.address),
      transactionHash: canonicalHex(value.nft.transactionHash),
      blockHash: canonicalHex(value.nft.blockHash),
      runtimeCodeHash: canonicalHex(value.nft.runtimeCodeHash),
      abiHash: canonicalHex(value.nft.abiHash),
    },
    escrow: {
      ...value.escrow,
      address: canonicalHex(value.escrow.address),
      transactionHash: canonicalHex(value.escrow.transactionHash),
      blockHash: canonicalHex(value.escrow.blockHash),
      runtimeCodeHash: canonicalHex(value.escrow.runtimeCodeHash),
      abiHash: canonicalHex(value.escrow.abiHash),
    },
    demoAccounts: value.demoAccounts
      ? Object.fromEntries(
          Object.entries(value.demoAccounts).map(([key, address]) => [key, canonicalHex(address)]),
        )
      : undefined,
  });
  if (descriptor.manifestHash !== sha256(JSON.stringify(databaseManifest)))
    mismatches.push('manifestHash' as keyof typeof expected);
  if (
    JSON.stringify(normalizeManifest(databaseManifest)) !==
    JSON.stringify(normalizeManifest(manifest))
  )
    mismatches.push('manifestJson' as keyof typeof expected);
  if (mismatches.length > 0)
    throw new Error(
      `DEPLOYMENT_DESCRIPTOR_MISMATCH: fields=${mismatches.join(',')} sources=manifest,database`,
    );
}

export interface ApiListenOptions {
  readonly host: string;
  readonly port: number;
}

export async function startApi(
  reader: ReadModelReader,
  manifest: DeploymentManifest,
  listenOptions: ApiListenOptions,
  appFactory: typeof createApp = createApp,
): Promise<FastifyInstance> {
  let app: FastifyInstance | undefined;
  try {
    assertDeploymentDescriptorMatchesManifest(reader.deploymentDescriptor(), manifest);
    const publicConfig = publicConfigSchema.parse({
      deploymentId: manifest.deploymentId,
      chainId: manifest.chainId,
      protocolVersion: manifest.protocolVersion,
      nftAddress: manifest.nft.address,
      escrowAddress: manifest.escrow.address,
      fundingPeriodSeconds: manifest.fundingPeriodSeconds,
    });
    app = await appFactory(reader, publicConfig);
    await app.listen(listenOptions);
    return app;
  } catch (error) {
    if (app) await app.close();
    else await reader.close();
    throw error;
  }
}
