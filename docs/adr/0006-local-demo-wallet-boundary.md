# ADR 0006: Keep the local demo wallet explicit and loopback-only

## Context

The application requires an injected EIP-1193 provider in normal operation. A browser without an
extension previously received a configured Wagmi injected connector anyway, so the UI rendered a
connect button that could not complete. The Playwright suite always injected a controlled provider,
which did not cover that state. Reviewers also need a safe way to operate the local stack in a browser
that has no wallet extension.

## Decision

- Filter the injected connector when `window.ethereum` is absent and render an unavailable state.
- Surface connector errors beside the connection controls.
- Add seller and buyer demo connectors only when `VITE_MOTORCOVE_DEMO_WALLET=1`, Vite is running in
  development mode, and the configured RPC URL is loopback.
- Use public Anvil test addresses and unlocked local JSON-RPC accounts. Do not embed private keys.
- Keep fault-injection tests on their controlled EIP-1193 provider and label that evidence separately
  from the normal local demo connector and manual extension testing.

## Consequences

Reviewers can complete a real local transaction path without installing a wallet extension. A
production build cannot enable the demo connectors, and a non-loopback RPC is rejected. Manual
MetaMask behavior remains an explicit unverified item.
