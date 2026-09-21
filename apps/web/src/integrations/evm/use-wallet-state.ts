import { useAccount, useConnect, useConnectors, useDisconnect, useSwitchChain } from 'wagmi';
import type { WalletConnectorChoice, WalletState } from '../../capabilities/wallet/index.js';

interface ConnectorSummary {
  id: string;
  name: string;
  type: string;
}

export function usableWalletConnectors<T extends ConnectorSummary>(
  connectors: readonly T[],
  injectedProviderAvailable: boolean,
): readonly T[] {
  return connectors.filter(
    (connector) =>
      connector.type !== 'injected' || connector.id !== 'injected' || injectedProviderAvailable,
  );
}

function connectorButtonLabel(connector: ConnectorSummary): string {
  if (connector.id === 'local-demo-seller') return 'Use local seller';
  if (connector.id === 'local-demo-buyer') return 'Use local buyer';
  return 'Connect wallet';
}

export function useWalletState(requiredChainId: number) {
  const account = useAccount();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();
  const injectedProviderAvailable =
    typeof window !== 'undefined' &&
    Boolean((window as typeof window & { ethereum?: unknown }).ethereum);
  const usableConnectors = usableWalletConnectors(connectors, injectedProviderAvailable);
  const connectorChoices: WalletConnectorChoice[] = usableConnectors.map((connector) => ({
    id: connector.uid,
    buttonLabel: connectorButtonLabel(connector),
  }));
  let state: WalletState;
  if (usableConnectors.length === 0) state = { kind: 'unavailable' };
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
    connectors: connectorChoices,
    error: connect.error?.message ?? switchChain.error?.message,
    connect: (connectorId: string) => {
      const connector = usableConnectors.find((candidate) => candidate.uid === connectorId);
      connect.reset();
      if (connector) connect.mutate({ connector });
    },
    disconnect: () => disconnect.disconnect(),
    switchNetwork: () => switchChain.switchChain({ chainId: requiredChainId }),
    pending: connect.isPending || switchChain.isPending,
  };
}
