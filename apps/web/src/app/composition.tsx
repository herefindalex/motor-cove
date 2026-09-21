import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { defineChain } from 'viem';
import type { PropsWithChildren } from 'react';
import { createLocalDemoConnectors } from '../integrations/evm/local-demo-connectors.js';
const rpcUrl = import.meta.env.VITE_MOTORCOVE_RPC_URL ?? 'http://127.0.0.1:8545';
const localChain = defineChain({
  id: 31337,
  name: 'MotorCove Anvil',
  nativeCurrency: { name: 'Test Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [rpcUrl] },
  },
});
const localDemoWalletEnabled =
  import.meta.env.DEV && import.meta.env.VITE_MOTORCOVE_DEMO_WALLET === '1';
const wagmi = createConfig({
  chains: [localChain],
  connectors: [injected(), ...(localDemoWalletEnabled ? createLocalDemoConnectors(rpcUrl) : [])],
  transports: { [localChain.id]: http() },
});
const queryClient = new QueryClient();
export function Composition({ children }: PropsWithChildren) {
  return (
    <WagmiProvider config={wagmi}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
