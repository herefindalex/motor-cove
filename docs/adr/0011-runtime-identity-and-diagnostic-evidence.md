# ADR 0011: Recheck live identity and preserve diagnostic evidence

## Status

Accepted.

## Context

Several existing safety boundaries were correct in isolation but did not cover the complete runtime
lifecycle. A transaction intent captured deployment identity, but its final pre-wallet check compared
only the account and chain. Catalog seeding took the maintenance lock without rejecting an earlier
failed maintenance marker. A signalled `flock` helper could exit before cleanup installed its exit
listener. Client navigation through a plain anchor destroyed the in-memory fallback used when a
returned transaction hash could not be persisted.

The diagnostic event feed also retained displaced source events without saying which rows were
currently canonical, and the architecture checker recognized a Web-to-database violation only by
its package specifier. These gaps do not require a new transaction journal, lock service, event
store, or dependency analyzer.

## Decision

- The final pre-wallet context check compares account, chain, deployment ID, protocol version, NFT
  address, and escrow address. A configuration change while simulation is pending invalidates the
  old request before the wallet call. Historical intents keep their original deployment identity.
- Internal marketplace navigation uses React Router links. The tab-local volatile transaction
  overlay therefore survives route changes within the running application. A real reload or tab
  close still loses non-durable evidence and remains an explicit recovery limit.
- Catalog seeding obtains the existing exclusive gate and then rejects any incomplete maintenance
  marker before opening the database or mutating catalog rows. Only the matching recovery command
  may resolve that marker.
- Advisory-lock helpers capture one completion promise when the child is spawned. Normal exit,
  signal exit, child error, repeated release, and composite cleanup all observe that same result.
- The raw recent-event feed retains both canonical and displaced audit history. Every event carries
  `canonical`, `scanComplete`, and the block's `sourceLogScopeHash`; consumers must evaluate those
  fields per row rather than infer validity from the response-level checkpoint.
- Architecture rules evaluate the resolved target's package ownership as well as the written import
  specifier. Relative paths, aliases, and re-exports cannot bypass the Web-to-database boundary.
- The stateful escrow suite independently sums funded Sales and claimable Payment Claims. It asserts
  that this expected outstanding amount equals `totalLiability`, and that contract balance covers
  that independently calculated amount. Successful transition counters remain separate from action
  attempts.

## Consequences

A deployment replacement during simulation produces no wallet request from the stale action. A
successful wallet request that has already started still follows the existing hash and `UNKNOWN`
recovery rules; the UI does not claim that it was never submitted.

An incomplete maintenance marker prevents catalog mutation even after operating-system locks have
been released. Read-only diagnostics and identity-matched recovery remain available.

The event API is an audit feed, not a canonical-only business feed. A displaced event remains
inspectable and can become canonical again without deleting its source evidence. The per-event
source scope is distinct from the response envelope's current projection scope.

The additional contract invariant strengthens evidence about recorded accounting. It remains local
Foundry evidence and does not constitute an external audit or public-network safety claim.
