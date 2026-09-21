# Project scope

This page defines what MotorCove demonstrates and where its claims stop.

## In scope

MotorCove models a narrow ERC-721 marketplace for local test assets. The product surface includes
an injected-wallet flow, approval and escrow listing, exact-price funding, completion or expiry,
pull-based proceeds and refunds, NFT reclaim, event-derived read models, a readonly query API, and
local database lifecycle tooling.

The engineering scope includes enforced module boundaries, generated ABI and HTTP contracts,
deployment identity, durable transaction observation, replacement and reorg classification,
replay/rebuild/reindex/reconciliation, migration history, maintenance coordination, local CI gates,
and contributor handoffs.

## Verified local recovery boundaries

- A lost wallet response after one real Anvil broadcast can be recovered after reload by supplying
  the transaction hash. Recovery is read-only and does not submit again.
- Same-nonce replacements are classified as `REPRICED`, `CANCELLED`, or `DIFFERENT_CALL`.
  Orphaned receipt evidence becomes `NONCANONICAL`, and same-hash reinclusion records new canonical
  receipt and event identity.
- Real SQLite cases cover native migration history and failure rollback, lock-owner `SIGKILL`,
  controlled `SQLITE_BUSY`, bounded `SQLITE_FULL`, replay, rebuild, canonical reindex, backup
  restore behind the live head, and one-snapshot API reads.
- A reset that reuses deterministic contract addresses is rejected when its deployment identity has
  changed. The reset CLI refuses non-loopback RPC, the wrong chain ID, and non-Anvil clients.
- Reconciliation uses anchored `saleCount` and `nextTokenId` to detect completely missing sales and
  ownership rows for every minted token.

## Current implementation or verification gaps

- A real process kill in the chain broadcast-to-hash journal window is not injected. Deterministic
  journal tests prove known-hash resume and conservative `UNKNOWN` behavior around that boundary.
- The first schema upgrade has a preserved-data `0000` to `0001` fixture. Compatibility with
  schemas outside the repository's recorded migration history remains unverified and unsupported.
- Controlled SQLite page exhaustion proves atomic rollback but does not simulate a full host
  filesystem. `SIGKILL` does not prove controller-cache, filesystem-flush, or hardware power-loss
  durability.
- Manual MetaMask prompts and provider-specific behavior are not verified. Browser automation uses a
  controlled EIP-1193 adapter.
- GitHub Actions runs are commit-specific and are recorded separately from local evidence. Branch
  protection, required-review settings, and repository reviewer identities still require owner
  configuration and remain unverified.

## Non-goals

- Physical vehicle title, delivery, financing, tax, or legal ownership.
- Mainnet or public testnet deployment, real currency, or valuable assets.
- Backend authentication, SIWE, wallet custody, key management, or automated signing.
- A production database service, cross-host SQLite, online migration, or zero-downtime restore.
- Automatic repair of every chain mismatch, generic public-network reorg policy, or exactly-once
  chain transactions.
- Claims of an external security audit, production load testing, team velocity, or actual team use.

## Safety boundaries

Only loopback Anvil, chain ID `31337`, synthetic accounts, test ETH, and test assets belong in demo
workflows. Maintenance commands require an owned environment under `.motorcove/environments/<id>`
and must not point at an arbitrary database. Use destructive demo commands only with a disposable
environment ID. The pre-existing `data/motorcove.sqlite` file is outside the managed path and is
never adopted or reset automatically.

Next: [architecture overview](architecture/overview.md),
[capability map](engineering-capability-map.md), or
[implementation status](implementation-status.md).
