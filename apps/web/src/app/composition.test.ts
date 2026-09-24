import { describe, expect, it } from 'vitest';
import { createMotorCoveWagmiConfig } from './web-chain-config.js';

describe('Web chain composition', () => {
  it.each([[31_337], [1], [137]] as const)(
    'registers %s as the sole chain with its selected RPC transport',
    (chainId) => {
      const rpcUrl = `http://127.0.0.1:${chainId}`;
      const config = createMotorCoveWagmiConfig({ chainId, rpcUrl, demoWalletEnabled: false });
      const getClient = config.getClient as (options: { chainId: number }) => {
        transport: { url?: string };
      };

      expect(config.chains).toHaveLength(1);
      expect(config.chains[0]?.id).toBe(chainId);
      expect(getClient({ chainId }).transport.url).toBe(rpcUrl);
      expect(config.connectors.map(({ id }) => id)).toEqual(['injected']);
    },
  );

  it('rejects unsupported and missing chain IDs without an Anvil fallback', () => {
    for (const chainId of [undefined, 10, 11155111]) {
      expect(() =>
        createMotorCoveWagmiConfig({
          chainId,
          rpcUrl: 'http://127.0.0.1:8545',
          demoWalletEnabled: false,
        }),
      ).toThrow('UNSUPPORTED_CHAIN_PROFILE');
    }
  });

  it('allows local demo connectors only for Anvil', () => {
    const anvil = createMotorCoveWagmiConfig({
      chainId: 31_337,
      rpcUrl: 'http://127.0.0.1:8545',
      demoWalletEnabled: true,
    });
    expect(anvil.connectors.map(({ id }) => id)).toEqual([
      'injected',
      'local-demo-seller',
      'local-demo-buyer',
    ]);

    for (const chainId of [1, 137]) {
      const publicConfig = createMotorCoveWagmiConfig({
        chainId,
        rpcUrl: `http://127.0.0.1:${chainId}`,
        demoWalletEnabled: true,
      });
      expect(publicConfig.connectors.map(({ id }) => id)).toEqual(['injected']);
    }
  });

  it('requires an explicit RPC URL for a public profile', () => {
    expect(() =>
      createMotorCoveWagmiConfig({
        chainId: 1,
        rpcUrl: '',
        demoWalletEnabled: false,
      }),
    ).toThrow('RPC_URL_REQUIRED: ethereum');
  });
});
