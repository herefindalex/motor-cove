# ADR 0021: Cross-tab submission ownership and volatile evidence rebase

- **Status:** accepted
- **Date:** 2026-09-22

## Context

The transaction capability previously kept same-intent submission ownership in a module-level
`Set`. That stopped repeated actions in one JavaScript realm, but two tabs could each persist the
same immutable intent, simulate it, and open a wallet request.

A separate recovery edge existed after a wallet returned a hash that local storage could not save.
The tab retained that hash in its volatile overlay. If another tab advanced the same durable entry
to a hashless revision, every later durability retry compared against the obsolete base revision
and failed. The current tab kept showing the hash, while a reload returned the hashless durable row.

## Decision

1. Browser submissions use an exclusive Web Lock keyed by the complete immutable intent. Ownership
   starts before the first journal write or other awaited step and remains through simulation,
   wallet interaction, returned-hash persistence, and optional nonce enrichment.
2. A busy same-intent activation fails with `OPERATION_ALREADY_IN_FLIGHT` before it can create a
   journal entry, simulate, or open a wallet request. Different immutable intents use different
   locks and remain concurrent.
3. Browsers without Web Locks keep the existing module-level fallback. That fallback coordinates
   only callers in one JavaScript realm and does not provide cross-tab ownership.
4. A volatile durability retry may rebase unique transaction evidence over a newer durable revision
   only when both rows describe the same client operation, immutable intent, and wallet request, and
   the durable row has no transaction evidence. The persisted revision advances from the current
   durable revision.
5. If the durable row already contains a hash, receipt, association, projection proof, or other
   transaction evidence, the retry fails closed. It never guesses which evidence wins and never
   opens another wallet request.

## Consequences

- One browser profile with Web Locks opens at most one wallet request for a concurrently activated
  immutable intent across tabs.
- Closing an owner tab releases its Web Lock through the browser lifecycle. Another tab may then
  acquire ownership and must start a new, explicit operation rather than inheriting an unknown
  in-memory callback.
- A returned hash can become durable after a concurrent hashless recovery revision without erasing
  that revision's immutable context.
- Cross-device coordination and cross-tab coordination without Web Locks remain outside the
  guarantee. Volatile-only evidence still cannot survive a reload until promotion succeeds.

## Verification

- `submit-operation.test.ts` proves rejected ownership precedes journal creation, simulation, and
  wallet submission.
- `browser-submission-coordinator.test.ts` covers same-intent exclusion, independent keys, and lock
  release after success or failure.
- `local-storage-journal.test.ts` covers safe hash rebase over a concurrent hashless revision and
  refuses to overwrite conflicting durable transaction evidence.
- `journal-multitab.spec.ts` uses two real Chromium pages to verify cross-tab submission exclusion,
  one wallet request, independent intents, normal release, and owner-close handoff.
