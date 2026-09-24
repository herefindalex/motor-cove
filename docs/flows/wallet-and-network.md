# Wallet and network flow

This page traces connection, chain validation, rejection, and transaction-context preservation.

## Authority and connector modes

In normal operation, the user controls an injected EIP-1193 wallet. Connecting exposes an account
and chain to the web application; it is not login, backend authentication, or key custody.

Local demonstrations may explicitly set `VITE_MOTORCOVE_DEMO_WALLET=1`. The frontend then adds two
Wagmi mock connectors backed by unlocked Anvil seller and buyer addresses. This mode is restricted to
the Vite development server and a loopback RPC. It embeds public test addresses, never private keys.
The connectors still submit real JSON-RPC transactions to Anvil.

`VITE_MOTORCOVE_CHAIN_ID` selects the single Wagmi chain profile: Anvil `31337`, Ethereum `1`, or
Polygon `137`. A public profile requires an explicit `VITE_MOTORCOVE_RPC_URL`; unsupported IDs stop
Web startup. The local demo connectors are available only with the Anvil profile, even when the demo
flag is set. The API deployment descriptor and wallet/provider identity checks still govern each
transaction before a wallet request.

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

Before opening the wallet request, the gateway saves the pending intent and verifies the intended
deployment through both the public RPC and the wallet provider. It compares the public chain ID,
the wallet client chain ID, and each provider's escrow `deploymentId()` with the immutable intent.
This check also covers token approval. A mismatch or unavailable proof stops before the wallet
write and records `FAILED_BEFORE_SUBMIT / OPERATION_ENVIRONMENT_MISMATCH`. A later wallet result
still follows the normal hash and unknown-result recovery rules.

A rejection is safe to retry as a new user decision. An unknown submission result is not. Account or
chain changes must not erase the immutable account, chain, contract, action, nonce, or hash stored by
an earlier operation. Reload resumes only entries with enough evidence to query without submitting.

Automated browser coverage has two distinct scopes: the local demo connector proves the normal
loopback transaction path, while a controlled EIP-1193 provider injects rejection, transport loss,
account changes, and network changes. Neither is evidence that MetaMask or another browser extension
was manually exercised.

Evidence: `TX-001`, `TX-002`; source under `capabilities/wallet`, `capabilities/transactions`, and
`integrations/evm`. Next: [transaction lifecycle](../protocol/transaction-lifecycle.md).

## Evidence identity and persistence failure

If the wallet returns a hash but the journal cannot persist the submitted state, the UI keeps the
operation context in memory, displays the copyable hash with a non-durable warning, and continues
read-only observation in the current tab. Reload recovery is explicitly limited in this state. A
failure to persist the initial intent still stops before any wallet request.

A reflected projection result is bound to the observed transaction hash, block hash, log index,
deployment, and projection build. Re-inclusion of the same transaction in a different block or log
invalidates the current reflection before the API lookup. An API outage may retain same-identity
historical evidence, but it cannot promote evidence from the previous identity.
