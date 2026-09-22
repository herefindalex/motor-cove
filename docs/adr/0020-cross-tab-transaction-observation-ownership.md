# ADR 0020: Cross-tab transaction observation ownership

- **Status:** accepted
- **Date:** 2026-09-22

## Context

Every `TransactionObserver` previously prevented duplicate work only inside its own React instance.
Two tabs could therefore inspect the same journal operation concurrently. Each inspection published
a new verification generation before reading RPC and API evidence. The other tab could supersede
that generation before its result was saved, so two healthy observers could repeatedly return
`SUPERSEDED` without advancing the operation.

The deployment journal already uses a short Web Lock while replacing durable bytes. Extending that
write lock over RPC and HTTP calls would serialize unrelated operations and make storage writes
depend on network latency.

## Decision

1. Transaction observation uses a dedicated exclusive lock keyed by deployment ID and client
   operation ID. The lock covers reloading the latest journal revision, selecting a verification
   generation, reading RPC or API evidence, and attempting the controlled journal update.
2. Automatic polling requests the Web Lock with `ifAvailable`. A busy tick is skipped instead of
   waiting and accumulating work. An explicit manual candidate check waits for the current owner,
   then reloads the operation before creating its generation.
3. Different operation IDs use different observation locks and remain concurrent. The existing
   deployment journal write lock still protects only the short read-modify-write storage section.
4. Browsers without Web Locks use a module-level queue. That fallback coordinates only observers in
   the same JavaScript realm; it does not claim cross-tab ownership. Closing a tab releases a Web
   Lock through the browser's lock lifecycle.

## Consequences

- Healthy observers for one operation cannot continually supersede one another across tabs when
  Web Locks are available.
- Manual evidence checks wait for an in-progress automatic check and use the latest journal
  revision. Automatic polling remains bounded and does not build a queue.
- Observation of one operation does not block another operation or an unrelated journal write.
- Cross-device coordination and cross-tab coordination in browsers without Web Locks remain outside
  the guarantee.

## Verification

- `browser-observation-coordinator.test.ts` checks automatic skip, manual queueing, rejection
  cleanup, and independent operation keys in one JavaScript realm.
- `TransactionObserver.coordination.test.tsx` mounts concurrent observers, proves only one recovery
  generation starts, and verifies that ownership reloads the latest journal revision.
- `journal-multitab.spec.ts` uses two real Chromium pages to verify Web Lock exclusion, independent
  operations, unrelated journal writes, and ownership transfer after the owner page closes.
