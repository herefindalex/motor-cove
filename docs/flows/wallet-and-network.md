# Wallet and network flow

This page traces connection, chain validation, rejection, and transaction-context preservation.

## Authority and connector modes

In normal operation, the user controls an injected EIP-1193 wallet. Connecting exposes an account
and chain to the web application; it is not login, backend authentication, or key custody.

Local demonstrations may explicitly set `VITE_MOTORCOVE_DEMO_WALLET=1`. The frontend then adds two
Wagmi mock connectors backed by unlocked Anvil seller and buyer addresses. This mode is restricted to
the Vite development server and a loopback RPC. It embeds public test addresses, never private keys.
The connectors still submit real JSON-RPC transactions to Anvil.

## Flow

1. `WagmiProvider` exposes the injected connector and, when explicitly enabled, local demo
   connectors from `apps/web/src/app/composition.tsx`.
2. The wallet integration filters out an injected connector when the browser has no provider. The
   capability renders an actionable unavailable state instead of a dead connect button.
3. The user selects a connector. Connection errors remain visible beside the retry controls.
4. The capability derives disconnected, wrong-network, and connected states.
5. A feature asks its EVM port to simulate the contract call against the current deployment.
6. The wallet may reject, switch chain, or submit. Durable intent is recorded before the request.
7. The transaction observer follows a known hash independently of later account or chain changes.

## Failure and recovery

A rejection is safe to retry as a new user decision. An unknown submission result is not. Account or
chain changes must not erase the immutable account, chain, contract, action, nonce, or hash stored by
an earlier operation. Reload resumes only entries with enough evidence to query without submitting.

Automated browser coverage has two distinct scopes: the local demo connector proves the normal
loopback transaction path, while a controlled EIP-1193 provider injects rejection, transport loss,
account changes, and network changes. Neither is evidence that MetaMask or another browser extension
was manually exercised.

Evidence: `TX-001`, `TX-002`; source under `capabilities/wallet`, `capabilities/transactions`, and
`integrations/evm`. Next: [transaction lifecycle](../protocol/transaction-lifecycle.md).
