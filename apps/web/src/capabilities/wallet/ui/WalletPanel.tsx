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
        No injected wallet detected. Use a browser wallet, or start the explicit local demo wallet.
      </div>
    );
  if (state.kind === 'disconnected')
    return (
      <div className="wallet">
        {connectors.map((connector) => (
          <button key={connector.id} onClick={() => onConnect(connector.id)} disabled={pending}>
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
        <span>Wrong network ({state.actualChainId})</span>
        <button onClick={onSwitch} disabled={pending}>
          Switch to local chain
        </button>
      </div>
    );
  return (
    <div className="wallet">
      <code>
        {state.account.slice(0, 6)}…{state.account.slice(-4)}
      </code>
      <button className="secondary" onClick={onDisconnect}>
        Disconnect
      </button>
    </div>
  );
}
