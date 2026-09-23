import type { WalletConnectorChoice, WalletState } from '../model.js';
export function WalletPanel({
  state,
  connectors,
  error,
  pending,
  onConnect,
  onDisconnect,
  onSwitch,
}: {
  state: WalletState;
  connectors: readonly WalletConnectorChoice[];
  error?: string | undefined;
  pending: boolean;
  onConnect(connectorId: string): void;
  onDisconnect(): void;
  onSwitch(): void;
}) {
  if (state.kind === 'unavailable')
    return (
      <div className="wallet danger" role="status">
        <strong>Wallet unavailable.</strong> No injected wallet detected. Use a browser wallet, or
        start the explicit local demo wallet.
      </div>
    );
  if (state.kind === 'disconnected')
    return (
      <div className="wallet">
        <strong role="status">Wallet disconnected.</strong>
        {connectors.map((connector) => (
          <button
            key={connector.id}
            type="button"
            onClick={() => onConnect(connector.id)}
            disabled={pending}
            aria-busy={pending}
          >
            {connector.buttonLabel}
          </button>
        ))}
        {error && (
          <span className="danger" role="alert">
            {error}
          </span>
        )}
      </div>
    );
  if (state.kind === 'wrong-network')
    return (
      <div className="wallet">
        <strong role="status">
          Wrong network ({state.actualChainId}). Expected local chain {state.requiredChainId}.
        </strong>
        <button type="button" onClick={onSwitch} disabled={pending} aria-busy={pending}>
          Switch to local chain
        </button>
        {error && (
          <span className="danger" role="alert">
            {error}
          </span>
        )}
      </div>
    );
  return (
    <div className="wallet">
      <strong role="status">Connected · local chain {state.chainId}</strong>
      <code>
        {state.account.slice(0, 6)}…{state.account.slice(-4)}
      </code>
      <button className="secondary" type="button" onClick={onDisconnect}>
        Disconnect
      </button>
    </div>
  );
}
