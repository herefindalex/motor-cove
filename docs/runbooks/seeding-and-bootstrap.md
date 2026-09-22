# How to seed and bootstrap a local environment

This runbook defines local seed and bootstrap behavior.

## When to use

Use bootstrap to coordinate a fresh owned local environment after starting one managed Anvil. Do not
use seed as reset, do not run it against a public RPC, and do not use it to restore a user's sale or
ownership to an initial state.

## Target sequence

1. Validate owner marker, loopback RPC, Anvil client, chain ID, and deployment identity.
2. Acquire environment bootstrap ownership. Each database operation then takes its existing
   maintenance locks and writes its external marker.
3. Migrate and verify DB, deploy contracts, and verify manifest code/getters/blocks.
4. Before every chain seed transaction, durably record `PREPARED`; then `SUBMITTED` and `VERIFIED`.
5. Obtain token/sale IDs from receipts and events, then seed catalog and bindings transactionally.
6. Capture target block/hash, run the normal ingestion application once, and assert checkpoint,
   catalog, sale, claim, and ownership state.
7. Write bootstrap receipt, clear marker, and release locks.

Known hashes are checked before retry. An outcome that may have been broadcast without durable hash
must stop as `UNKNOWN`. Completed bootstrap verifies historical evidence and does not
mint or list again.

## Current implementation

`seed:catalog` implements atomic idempotence and `SEED_CONFLICT` for one fixed local dataset.
`dev:bootstrap` deploys local contracts through the environment-owned `seed-journal.json`, registers
deployment evidence, seeds catalog bindings, catches up through the captured block/hash, and writes
the receipt. Each deployment, mint, approval, and listing step binds its parameters to an intent
digest. A nonblocking ownership lock covers this complete callback, so two bootstrap processes for
the same environment cannot both enter chain submission. A rerun with a known hash waits for that
receipt; a verified step rechecks the same receipt
and never submits again. A stranded `PREPARED` step or a submit call whose outcome cannot be proven
becomes `UNKNOWN` and stops for operator review. The command never guesses whether an ambiguous
transaction should be sent again.

Catalog seeding acquires the existing exclusive maintenance gate and then checks the durable marker
before opening the database or changing rows. A `PENDING` or `FAILED` marker from an incomplete
operation returns `MAINTENANCE_INCOMPLETE`; catalog rows, deployment bindings, and the marker remain
unchanged. Do not remove or ignore the marker to make seeding continue. Use the identity-matched
recovery command for the recorded operation.

Once `deployment.json` exists, a rerun verifies runtime code hashes and the deployment ID getter,
then performs database registration, catalog idempotence, and catch-up only. It does not mint, list,
or restore user-owned chain state. Do not edit the journal to force progress; preserve it with the
environment and diagnose the RPC and transaction evidence.

## Verification

`pnpm test:seeds` covers DB-23–DB-25 and DB-29 in temporary SQLite environments, including rejection
of a changed seed version without overwriting the applied dataset. Journal unit tests cover
successful transitions, known-hash resume, verified receipt revalidation, identity/intent mismatch,
and conservative `UNKNOWN` handling. The real-stack test covers fresh event-derived bootstrap and a
rerun after user settlement, refund, withdrawal, and NFT reclaim. A two-process regression proves
that only one bootstrap callback enters while the owner is active. Maintenance tests prove catalog
seeding is read-only when an incomplete marker exists. Lock lifecycle tests cover normal exit,
signal exit before release, repeated release, and composite cleanup. A real process-kill injection in
the broadcast-to-hash persistence window remains unverified. See the
[database matrix](../testing/database-acceptance-matrix.md).
