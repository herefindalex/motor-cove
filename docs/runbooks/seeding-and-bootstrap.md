# How to seed and bootstrap a local environment

This runbook defines local seed and bootstrap behavior.

## When to use

Use bootstrap to coordinate a fresh owned local environment after starting one managed Anvil. Do not
use seed as reset, do not run it against a public RPC, and do not use it to restore a user's sale or
ownership to an initial state.

## Target sequence

1. Validate owner marker, loopback RPC, Anvil client, chain ID, and deployment identity.
2. Acquire exclusive environment bootstrap ownership. Standard backup takes shared bootstrap
   ownership and restore takes exclusive ownership before their maintenance locks, so neither can
   publish or install a snapshot across this lifecycle.
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

A deployed standard backup contains both `seed-journal.json` and `bootstrap-receipt.json`, or
neither for a deployment managed outside this bootstrap path. An incomplete pair is rejected. A
migration safety snapshot created inside bootstrap explicitly reuses the caller's lifecycle
ownership instead of trying to reacquire the non-reentrant lock.

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

## Dedicated local node claim

After bootstrap confirms the expected chain ID and before it submits deployment or seed
transactions, it claims the configured loopback RPC endpoint for the managed environment. Claims
are serialized by the workspace-wide `managed-nodes.lock`. A second environment using the same
normalized endpoint is rejected before chain writes.

Keep the generated `managed-node.json` with the environment lifecycle. A missing or edited binding
is an ownership failure; recreate the environment deliberately instead of copying another
environment's binding.

## Recoverable post-hash persistence

If the first `SUBMITTED` journal write fails after the submit callback returned a hash, the command
retries only the journal write. A successful retry preserves the step as `SUBMITTED`, records the
`POST_SUBMIT_PERSISTENCE_FAILURE` category, and returns
`CHAIN_SEED_POST_SUBMIT_PERSISTENCE_RECOVERED`. Reopen the same environment and rerun bootstrap: it
waits for the saved hash and does not call submit again. A failure before any hash remains
`SUBMIT_OUTCOME_UNKNOWN` and requires operator review.

Journal regression tests inject one transient post-hash write fault and prove that the reopened
journal verifies the original hash without a second submit. Hashless submission failures, stranded
`PREPARED` steps, changed intent, and changed receipt evidence remain fail-closed.

## Escrow binding step

Fresh bootstrap deploys `VehicleNFT`, deploys `MotorCoveEscrow`, and then records the
`bind-vehicle-nft-escrow` transaction before minting demo tokens. The binding is one-time and the
transaction receipt is part of the chain seed journal. Verify it by reading
`VehicleNFT.motorCoveEscrow()` and comparing the result with the manifest escrow address.
An existing manifest is accepted only when that on-chain binding still matches; a missing getter or
different address returns `DEPLOYMENT_MISMATCH` before database bootstrap.

An environment created with contract bytecode from before this binding cannot be upgraded in place;
the contracts are non-upgradeable. Keep that environment for inspection or run the explicit local
reset workflow before bootstrapping a fresh deployment. Bootstrap never resets or replaces an
existing environment implicitly.

## Bootstrap completion sidecars

Bootstrap publishes `deployment.json` and `bootstrap-receipt.json` as complete immutable JSON
sidecars: validate, write and flush an operation-unique temporary file, rename into place, and sync
the containing directory. On resume, an existing final file must parse and match its environment
and deployment. The receipt also validates its target block/hash, projection build ID, and completion
time. Its target and build ID are historical completion evidence; later transactions may advance
the chain head, and a valid rebuild may use a different current projection build. A deployed standard backup requires this receipt and the paired seed
journal. Malformed or conflicting final content stops the operation for explicit recovery.
