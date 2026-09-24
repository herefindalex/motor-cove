import { chainProfileForId } from '@motorcove/chain-artifacts/profiles';
import { defineChain } from 'viem';
import { mainnet, polygon } from 'viem/chains';
import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { createLocalDemoConnectors } from '../integrations/evm/local-demo-connectors.js';

export function createMotorCoveWagmiConfig(options: {
  readonly chainId: string | number | undefined;
  readonly rpcUrl: string;
  readonly demoWalletEnabled: boolean;
}) {
  const profile = chainProfileForId(options.chainId ?? 'UNCONFIGURED');
  if (!options.rpcUrl) throw new Error(`RPC_URL_REQUIRED: ${profile.key}`);
  if (profile.key === 'anvil') {
    const chain = defineChain({
      id: 31_337,
      name: 'MotorCove Anvil',
      nativeCurrency: { name: 'Test Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [options.rpcUrl] } },
    });
    return createConfig({
      chains: [chain],
      connectors: [
        injected(),
        ...(options.demoWalletEnabled ? createLocalDemoConnectors(options.rpcUrl) : []),
      ],
      transports: { [chain.id]: http(options.rpcUrl) },
    });
  }
  if (profile.key === 'ethereum') {
    const chain = defineChain({
      ...mainnet,
      rpcUrls: { default: { http: [options.rpcUrl] } },
    });
    return createConfig({
      chains: [chain],
      connectors: [injected()],
      transports: { [chain.id]: http(options.rpcUrl) },
    });
  }
  const chain = defineChain({
    ...polygon,
    rpcUrls: { default: { http: [options.rpcUrl] } },
  });
  return createConfig({
    chains: [chain],
    connectors: [injected()],
    transports: { [chain.id]: http(options.rpcUrl) },
  });
}
