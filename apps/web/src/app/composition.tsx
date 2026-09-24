import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import type { PropsWithChildren } from 'react';
import { createMotorCoveWagmiConfig } from './web-chain-config.js';
const chainId = import.meta.env.VITE_MOTORCOVE_CHAIN_ID;
const rpcUrl =
  import.meta.env.VITE_MOTORCOVE_RPC_URL ?? (chainId === '31337' ? 'http://127.0.0.1:8545' : '');
const localDemoWalletEnabled =
  import.meta.env.DEV && import.meta.env.VITE_MOTORCOVE_DEMO_WALLET === '1';
const wagmi = createMotorCoveWagmiConfig({
  chainId,
  rpcUrl,
  demoWalletEnabled: localDemoWalletEnabled,
});
const queryClient = new QueryClient();
export function Composition({ children }: PropsWithChildren) {
  return (
    <WagmiProvider config={wagmi}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
