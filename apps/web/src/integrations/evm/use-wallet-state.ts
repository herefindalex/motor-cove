import { useAccount, useConnect, useConnectors, useDisconnect, useSwitchChain } from 'wagmi';
import type { WalletState } from '../../capabilities/wallet/index.js';

export function useWalletState(requiredChainId: number) {
  const account = useAccount();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();
  let state: WalletState;
  if (connectors.length === 0) state = { kind: 'unavailable' };
  else if (!account.address || account.chainId === undefined) state = { kind: 'disconnected' };
  else if (account.chainId !== requiredChainId)
    state = {
      kind: 'wrong-network',
      account: account.address,
      actualChainId: account.chainId,
      requiredChainId,
    };
  else state = { kind: 'connected', account: account.address, chainId: account.chainId };
  return {
    state,
    connect: () => {
      const connector = connectors[0];
      if (connector) connect.mutate({ connector });
    },
    disconnect: () => disconnect.disconnect(),
    switchNetwork: () => switchChain.switchChain({ chainId: requiredChainId }),
    pending: connect.isPending || switchChain.isPending,
  };
}
