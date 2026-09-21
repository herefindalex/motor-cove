# Wallet and network flow

This page traces connection, chain validation, rejection, and transaction-context preservation.

## Preconditions and authority

The user controls an injected EIP-1193 wallet. Connecting exposes an account and chain to the web
application; it is not login, backend authentication, or key custody. MotorCove supports only the
configured local Anvil chain.

## Flow

1. `WagmiProvider` exposes the injected connector from `apps/web/src/app/composition.tsx`.
2. The wallet capability derives disconnected, connecting, wrong-network, and ready states.
3. A feature asks its EVM port to simulate a contract call against the current deployment.
4. The wallet may reject, switch chain, or submit. Intent is recorded before the request.
5. The transaction observer follows a known hash independently of later account or chain changes.

## Failure and recovery

A rejection is safe to retry as a new user decision. An unknown submission result is not. Account
or chain change must not erase the immutable account, chain, contract, action, nonce, and hash stored
with an earlier operation. Reload resumes only entries with enough evidence to query.

Evidence: `TX-001`, `TX-002`; source under `capabilities/wallet`,
`capabilities/transactions`, and `integrations/evm`. Manual MetaMask behavior is not verified.

Next: [transaction lifecycle](../protocol/transaction-lifecycle.md).
