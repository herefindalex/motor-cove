import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DeploymentManifest } from '@motorcove/chain-artifacts/manifest';
import type { DeploymentDescriptor, ReadModelReader } from '@motorcove/database/reader';
import { assertDeploymentDescriptorMatchesManifest, startApi } from './start-api.js';

const hash = (character: string) => `0x${character.repeat(64)}`;
const address = (character: string) => `0x${character.repeat(40)}`;
const sha256 = (value: string) => `0x${createHash('sha256').update(value).digest('hex')}`;
const manifest: DeploymentManifest = {
  manifestVersion: 1,
  deploymentId: hash('1'),
  chainId: '31337',
  protocolVersion: '0.2.0',
  compiler: 'solc 0.8.24',
  buildId: 'foundry-test',
  scanStartBlock: '1',
  fundingPeriodSeconds: '300',
  nft: {
    address: address('2'),
    transactionHash: hash('3'),
    blockNumber: '1',
    blockHash: hash('4'),
    runtimeCodeHash: hash('5'),
    abiHash: hash('6'),
  },
  escrow: {
    address: address('7'),
    transactionHash: hash('8'),
    blockNumber: '2',
    blockHash: hash('9'),
    runtimeCodeHash: hash('a'),
    abiHash: hash('b'),
  },
};

const descriptor = (registeredManifest = manifest): DeploymentDescriptor => ({
  deploymentId: registeredManifest.deploymentId,
  chainId: registeredManifest.chainId,
  nftAddress: registeredManifest.nft.address,
  escrowAddress: registeredManifest.escrow.address,
  protocolVersion: registeredManifest.protocolVersion,
  abiBundleHash: sha256(
    `${registeredManifest.nft.abiHash.toLowerCase()}:${registeredManifest.escrow.abiHash.toLowerCase()}`,
  ),
  scanStartBlock: Number(registeredManifest.scanStartBlock),
  nftDeploymentBlock: Number(registeredManifest.nft.blockNumber),
  nftDeploymentHash: registeredManifest.nft.blockHash,
  nftRuntimeCodeHash: registeredManifest.nft.runtimeCodeHash,
  escrowDeploymentBlock: Number(registeredManifest.escrow.blockNumber),
  escrowDeploymentHash: registeredManifest.escrow.blockHash,
  escrowRuntimeCodeHash: registeredManifest.escrow.runtimeCodeHash,
  manifestHash: sha256(JSON.stringify(registeredManifest)),
  manifestJson: JSON.stringify(registeredManifest),
});

describe('API deployment identity startup gate', () => {
  it('rejects a same-ID manifest with conflicting contract identity before creating the app', async () => {
    const close = vi.fn(async () => {});
    const reader = {
      deploymentDescriptor: () => descriptor(),
      close,
    } as unknown as ReadModelReader;
    const appFactory = vi.fn();
    const conflicting = {
      ...manifest,
      escrow: { ...manifest.escrow, address: address('c') },
    } satisfies DeploymentManifest;

    await expect(
      startApi(reader, conflicting, { host: '127.0.0.1', port: 0 }, appFactory),
    ).rejects.toThrow('DEPLOYMENT_DESCRIPTOR_MISMATCH: fields=escrowAddress,manifestJson');
    expect(appFactory).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('accepts the registered descriptor and closes through the app when listen fails', async () => {
    const readerClose = vi.fn(async () => {});
    const reader = {
      deploymentDescriptor: () => descriptor(),
      close: readerClose,
    } as unknown as ReadModelReader;
    const appClose = vi.fn(async () => {});
    const app = {
      listen: vi.fn(async () => {
        throw new Error('listen failed');
      }),
      close: appClose,
    } as unknown as FastifyInstance;

    await expect(
      startApi(reader, manifest, { host: '127.0.0.1', port: 0 }, async () => app),
    ).rejects.toThrow('listen failed');
    expect(appClose).toHaveBeenCalledOnce();
    expect(readerClose).not.toHaveBeenCalled();
  });

  it('normalizes equivalent hexadecimal casing', () => {
    const upper = {
      ...manifest,
      deploymentId: manifest.deploymentId.toUpperCase().replace('0X', '0x'),
      nft: {
        ...manifest.nft,
        address: manifest.nft.address.toUpperCase().replace('0X', '0x'),
        transactionHash: manifest.nft.transactionHash.toUpperCase().replace('0X', '0x'),
        blockHash: manifest.nft.blockHash.toUpperCase().replace('0X', '0x'),
        runtimeCodeHash: manifest.nft.runtimeCodeHash.toUpperCase().replace('0X', '0x'),
        abiHash: manifest.nft.abiHash.toUpperCase().replace('0X', '0x'),
      },
      escrow: {
        ...manifest.escrow,
        address: manifest.escrow.address.toUpperCase().replace('0X', '0x'),
        transactionHash: manifest.escrow.transactionHash.toUpperCase().replace('0X', '0x'),
        blockHash: manifest.escrow.blockHash.toUpperCase().replace('0X', '0x'),
        runtimeCodeHash: manifest.escrow.runtimeCodeHash.toUpperCase().replace('0X', '0x'),
        abiHash: manifest.escrow.abiHash.toUpperCase().replace('0X', '0x'),
      },
    } as DeploymentManifest;
    expect(() => assertDeploymentDescriptorMatchesManifest(descriptor(), upper)).not.toThrow();
  });
});
