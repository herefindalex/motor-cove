import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { DeploymentManifest } from '@motorcove/chain-artifacts/manifest';
import type { DeploymentDescriptor } from '@motorcove/database/reader';
import { assertDeploymentDescriptorMatchesManifest } from './start-api.js';

const hash = (c: string) => `0x${c.repeat(64)}`;
const address = (c: string) => `0x${c.repeat(40)}`;
const sha256 = (v: string) => `0x${createHash('sha256').update(v).digest('hex')}`;
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

function descriptor(): DeploymentDescriptor {
  return {
    deploymentId: manifest.deploymentId,
    chainId: manifest.chainId,
    nftAddress: manifest.nft.address,
    escrowAddress: manifest.escrow.address,
    protocolVersion: manifest.protocolVersion,
    abiBundleHash: sha256(
      `${manifest.nft.abiHash.toLowerCase()}:${manifest.escrow.abiHash.toLowerCase()}`,
    ),
    scanStartBlock: Number(manifest.scanStartBlock),
    nftDeploymentBlock: Number(manifest.nft.blockNumber),
    nftDeploymentHash: manifest.nft.blockHash,
    nftRuntimeCodeHash: manifest.nft.runtimeCodeHash,
    escrowDeploymentBlock: Number(manifest.escrow.blockNumber),
    escrowDeploymentHash: manifest.escrow.blockHash,
    escrowRuntimeCodeHash: manifest.escrow.runtimeCodeHash,
    manifestHash: sha256(JSON.stringify(manifest)),
    manifestJson: JSON.stringify(manifest),
  };
}

const mutations: Array<[string, (v: DeploymentDescriptor) => DeploymentDescriptor]> = [
  ['deploymentId', (v) => ({ ...v, deploymentId: hash('c') })],
  ['chainId', (v) => ({ ...v, chainId: '1' })],
  ['nftAddress', (v) => ({ ...v, nftAddress: address('c') })],
  ['escrowAddress', (v) => ({ ...v, escrowAddress: address('c') })],
  ['protocolVersion', (v) => ({ ...v, protocolVersion: 'other' })],
  ['abiBundleHash', (v) => ({ ...v, abiBundleHash: hash('c') })],
  ['scanStartBlock', (v) => ({ ...v, scanStartBlock: 9 })],
  ['nftDeploymentBlock', (v) => ({ ...v, nftDeploymentBlock: 9 })],
  ['nftDeploymentHash', (v) => ({ ...v, nftDeploymentHash: hash('c') })],
  ['nftRuntimeCodeHash', (v) => ({ ...v, nftRuntimeCodeHash: hash('c') })],
  ['escrowDeploymentBlock', (v) => ({ ...v, escrowDeploymentBlock: 9 })],
  ['escrowDeploymentHash', (v) => ({ ...v, escrowDeploymentHash: hash('c') })],
  ['escrowRuntimeCodeHash', (v) => ({ ...v, escrowRuntimeCodeHash: hash('c') })],
  ['manifestHash', (v) => ({ ...v, manifestHash: hash('c') })],
  [
    'manifestJson',
    (v) => ({ ...v, manifestJson: JSON.stringify({ ...manifest, buildId: 'different-build' }) }),
  ],
];

describe('API deployment descriptor immutable identity matrix', () => {
  it.each(mutations)('rejects a mismatch in %s', (_field, mutate) => {
    expect(() => assertDeploymentDescriptorMatchesManifest(mutate(descriptor()), manifest)).toThrow(
      'DEPLOYMENT_DESCRIPTOR_MISMATCH',
    );
  });

  it('accepts the exact descriptor', () => {
    expect(() => assertDeploymentDescriptorMatchesManifest(descriptor(), manifest)).not.toThrow();
  });
});
