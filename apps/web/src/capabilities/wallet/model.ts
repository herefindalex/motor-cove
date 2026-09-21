export type WalletState =
  | { kind: 'unavailable' }
  | { kind: 'disconnected' }
  | {
      kind: 'wrong-network';
      account: `0x${string}`;
      actualChainId: number;
      requiredChainId: number;
    }
  | { kind: 'connected'; account: `0x${string}`; chainId: number };
