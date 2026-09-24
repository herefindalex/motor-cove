import { describe, expect, it } from 'vitest';
import { chainProfileForId } from './chain-profile.js';

describe('supported chain profiles', () => {
  it.each([
    [31337, 'anvil', 'IMMEDIATE', false],
    [1, 'ethereum', 'RPC_FINALIZED', true],
    [137, 'polygon', 'RPC_FINALIZED', true],
  ] as const)('resolves chain %i', (chainId, key, finalityKind, finalizedTag) => {
    const profile = chainProfileForId(String(chainId));
    expect(profile).toMatchObject({
      chainId,
      key,
      finality: { kind: finalityKind },
      providerRequirements: {
        blockHashLogs: true,
        finalizedTag,
      },
    });
  });

  it.each(['0', '10', '999', '-1', '1.0', 'not-a-chain'])('rejects %s', (chainId) => {
    expect(() => chainProfileForId(chainId)).toThrow('UNSUPPORTED_CHAIN_PROFILE');
  });

  it('does not share mutable policy between profiles or callers', () => {
    const ethereum = chainProfileForId(1);
    const polygon = chainProfileForId(137);
    expect(ethereum.finality).not.toBe(polygon.finality);
    expect(Object.isFrozen(ethereum)).toBe(true);
    expect(Object.isFrozen(ethereum.finality)).toBe(true);
    expect(Object.isFrozen(ethereum.providerRequirements)).toBe(true);
    expect(chainProfileForId(1)).toBe(ethereum);
  });
});
