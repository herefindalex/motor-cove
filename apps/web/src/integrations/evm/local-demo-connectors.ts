import type { Address } from 'viem';
import { mock } from 'wagmi/connectors';

export const localDemoAccounts = {
  seller: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  buyer: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
} as const satisfies Record<string, Address>;

function namedMockConnector(id: string, name: string, account: Address): ReturnType<typeof mock> {
  const base = mock({ accounts: [account] });
  return (config) => ({ ...base(config), id, name });
}

export function isLoopbackRpcUrl(rpcUrl: string): boolean {
  try {
    const hostname = new URL(rpcUrl).hostname;
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
  } catch {
    return false;
  }
}

export function createLocalDemoConnectors(rpcUrl: string) {
  if (!isLoopbackRpcUrl(rpcUrl)) {
    throw new Error('LOCAL_DEMO_WALLET_REQUIRES_LOOPBACK_RPC');
  }
  return [
    namedMockConnector('local-demo-seller', 'Local demo seller', localDemoAccounts.seller),
    namedMockConnector('local-demo-buyer', 'Local demo buyer', localDemoAccounts.buyer),
  ] as const;
}
