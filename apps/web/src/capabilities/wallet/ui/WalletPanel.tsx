import type { WalletState } from '../model.js';
export function WalletPanel({
  state,
  pending,
  onConnect,
  onDisconnect,
  onSwitch,
}: {
  state: WalletState;
  pending: boolean;
  onConnect(): void;
  onDisconnect(): void;
  onSwitch(): void;
}) {
  if (state.kind === 'unavailable')
    return <div className="wallet danger">No injected wallet detected.</div>;
  if (state.kind === 'disconnected')
    return (
      <button onClick={onConnect} disabled={pending}>
        Connect wallet
      </button>
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
