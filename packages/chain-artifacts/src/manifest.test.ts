import { describe, expect, it } from 'vitest';
import { deploymentManifestSchema, protocolVersion } from './manifest.js';

const bytes32 = `0x${'1'.repeat(64)}`;
const address = `0x${'2'.repeat(40)}`;
const contract = {
  address,
  transactionHash: bytes32,
  blockNumber: '1',
  blockHash: bytes32,
  runtimeCodeHash: bytes32,
  abiHash: bytes32,
};

describe('reserved-buyer protocol compatibility', () => {
  it('accepts the current protocol and rejects the pre-reservation version', () => {
    const manifest = {
      manifestVersion: 1,
      deploymentId: bytes32,
      chainId: '31337',
      protocolVersion,
      compiler: 'solc 0.8.24',
      buildId: 'test',
      scanStartBlock: '1',
      fundingPeriodSeconds: '300',
      nft: contract,
      escrow: contract,
    };
    expect(deploymentManifestSchema.parse(manifest).protocolVersion).toBe('0.2.0');
    expect(
      deploymentManifestSchema.safeParse({ ...manifest, protocolVersion: '0.1.0' }).success,
    ).toBe(false);
  });
});
