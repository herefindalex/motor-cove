# MotorCove agent guide

This file is the operational entry point for contributors and coding agents. Project files and
public documentation use English. Preserve unrelated working-tree changes and never delete, reset,
or adopt an existing local database to make a check pass.

## Read first

1. Read this file and the nearest applicable `AGENTS.md` before editing.
2. Read [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md), and the relevant page in
   [docs/README.md](docs/README.md).
3. For implementation requirements, use the specifications under `docs/internal/`. Database,
   migration, seed, bootstrap, and recovery conflicts are resolved by the database handoff. The
   transaction convergence addendum governs transaction and projection recovery. Product and
   module architecture otherwise follow the implementation prompt.
4. Inspect `git status`, the affected source, tests, generated artifacts, and package scripts before
   changing files. Do not overwrite user changes.

## Safety boundary

- Use loopback Anvil, chain ID `31337`, synthetic accounts, test ETH, and test assets only.
- Never deploy to a mainnet or public testnet, use a public RPC, or handle a real wallet secret.
- Managed state belongs under `.motorcove/environments/<id>`. Never adopt or reset
  `data/motorcove.sqlite`.
- Do not commit `.motorcove/`, `data/`, local deployment manifests, databases, backups, wallet
  journals, traces, secrets, or environment-specific paths.
- Stop API and Indexer before migration, restore, rebuild, reindex, reconciliation, recovery, or
  reset. Destructive commands require the documented owned-environment and loopback guards.

## Repository boundaries

- `apps/web`: React UI. Features own use cases, capabilities own long-lived wallet and transaction
  state, and `integrations/` owns Wagmi, Viem, HTTP, and persistence adapters.
- `apps/api`: readonly Fastify query API. It may import database reader, environment, and type
  surfaces only.
- `apps/indexer`: chain ingestion and projections. Domain projectors stay pure and do not import
  Viem, SQLite, React, or wall-clock time.
- `packages/api-contracts`: Zod and generated OpenAPI provider contract.
- `packages/chain-artifacts`: generated ABI and deployment-manifest contracts.
- `packages/database`: the only database package and migration history. Consumers use only
  `reader`, `projection-writer`, `maintenance`, `environment`, and `types` public exports.
- `chain`: Solidity contracts, deployment scripts, and Foundry tests.
- `tooling`: project-owned generation, architecture, documentation, database, and seed commands.
- `tests`: cross-package integration, E2E, migration, database, seed, and recovery evidence.

Do not add a second database package, migration runner, seed path, reset path, or projection writer.
Do not deep-import package source or make one application import another application's source.
Run `pnpm check:architecture` after changing imports or public surfaces; add a failing negative
fixture when introducing a new dependency rule.

## State and recovery rules

- Keep transaction, receipt, sale, payment claim, and projection states separate.
- A successful receipt does not prove projection convergence. A stale projection is not a reason to
  resubmit a transaction.
- Browser recovery is read-only. It must not reach a wallet-write port.
- Coordinate receipt and projection observation per deployment and client operation. Automatic
  polling must skip a busy owner, manual evidence checks may wait, and ownership must include the
  latest-journal reload through the controlled result save. Do not hold the deployment journal write
  lock across RPC or HTTP work; the no-Web-Locks fallback is same-realm only.
- Acquire same-intent submission ownership synchronously before simulation or persistence awaits;
  the browser adapter must hold cross-tab Web Lock ownership through returned-hash handling. Keep
  unrelated action intents independent, preserve the durable pre-wallet write, and describe the
  no-Web-Locks fallback as same-realm only.
- Rebase volatile transaction evidence over a concurrent hashless durable revision only for the
  same operation, immutable intent, and wallet request. Existing durable transaction evidence wins;
  never resolve a conflict by resubmitting or silently overwriting it.
- Preserve historical receipt and event evidence when a transaction becomes noncanonical; derive
  current success from current transaction, receipt, and projection evidence together.
- Bind candidate-hash inspection to the saved descriptor, configured contracts, actual RPC chain,
  and on-chain deployment getter before requesting transaction evidence. A storage write failure
  must not block known-hash read-only inspection or authorize a wallet request; keep volatile
  evidence distinct from the last durable revision.
- Temporary RPC transport failures keep the checkpoint, mark the read model stale, and retry with
  bounded backoff. Confirmed hash discontinuity or a provider-confirmed missing checkpoint block
  requires recovery.
- Rebuild uses verified local raw evidence. Reindex revalidates canonical chain evidence. Both use
  the exclusive maintenance gate and durable operation marker and preserve catalog authority.
- Bind every fetched log batch to the exact headers observed for that batch. Query logs by block
  hash and reject any event whose block hash differs from the supplied header snapshot.
- A reindex marker in `CATCHING_UP` is durable progress. Resume from its checkpoint and fixed target
  without rewinding the source journal again; fail if a successful ingestion step makes no progress.
- Reconciliation keeps `(deployment, collection, token)` ownership identity. Source content
  mismatches require a verified archive before reacquisition; a pure missing row may use rewind and
  reinsert.
- Migration, seed, bootstrap, restore, reset, rebuild, reindex, and reconciliation are distinct
  operations. Never rewrite an applied migration or clear `maintenance.json` by hand.
- Treat the verified pre-migration backup as a durable migration phase. A resume without recorded,
  revalidated backup proof must retry backup creation before SQL; a valid recorded proof is reused.
- Treat the published maintenance marker as the only committed operation state. Marker updates use
  unique temporary files; unpublished orphan bytes never advance or block a matching resume.
- A standard backup requires no maintenance marker. Internal migration and source refresh archives
  bind the current operation and remain evidence-only; normal restore must not install them.
- Standard backup must hold shared bootstrap ownership; restore must hold exclusive bootstrap
  ownership before maintenance locks. A deployed standard snapshot requires matching seed journal
  and bootstrap receipt evidence, and database-only restore must reject changed active sidecars
  before quarantine.
- Reconciliation freshness comes from a latest-head read after the anchored comparison. Head
  movement produces projection lag; an unavailable publication head is unknown, never `CURRENT`.
- Publish `RESET / PREPARED` before `anvil_reset`, preserve the reset phase on failure, and complete
  reset recovery only from phase evidence. A structurally valid old database is not reset completion.
- If a durable checkpoint is above `head - indexingDepth`, fail closed and require the existing
  explicit reindex path. Never mark a projection current while it contains newly held-back blocks.
- Create `owner.json` only for a genuinely empty managed environment. Existing database files,
  sidecars, symlinks, or unknown files without ownership are preserved and rejected, never adopted.
- A maintenance completion command must acquire ownership and then reread the current marker before
  selecting or mutating recovery state. Lock-free marker reads are diagnostic previews only.

## Provider changes

Treat ABI/events, OpenAPI schemas, database schema and exports, projector/scope versions, deployment
manifest semantics, commands, and scenario/evidence metadata as provider contracts. A provider
change includes every affected consumer, generated artifact, compatibility test, runbook, and
status/evidence update in the same delivery.

Run `pnpm generate` after Solidity, API schema, or generated metadata changes. Commit deterministic
generated artifacts and use `pnpm generate:check` to detect drift.

## Toolchain and commands

Use the pinned versions from `.nvmrc`, `package.json`, `pnpm-lock.yaml`, and
`chain/foundry.toml`: Node 24.21.0, pnpm 12.5.1, and Foundry/Anvil 1.8.3.

```bash
nvm use
pnpm install --frozen-lockfile
pnpm doctor
```

Start with the narrowest affected check, then run the relevant gate:

```bash
pnpm test:contracts
pnpm test:components
pnpm test:migrations
pnpm test:db
pnpm test:seeds
pnpm test:recovery
pnpm test:integration
pnpm docs:check
pnpm check:architecture
```

Before delivery, run:

```bash
pnpm verify
pnpm test:e2e
```

`pnpm docs:smoke` is a temporary SQLite-only contributor smoke test. Full browser evidence uses a
fresh harness-owned Anvil, managed environment, Indexer, API, and Web through `pnpm test:e2e`.

## Documentation and evidence

- Public documentation is English except files whose names explicitly mark another language, such
  as `README.zh-TW.md` and `walkthrough.zh-TW.md`.
- Keep bilingual entry points structurally aligned when changing shared claims or commands.
- Keep requirement, implementation, and executed verification status separate. A source file or
  test existing is not evidence that it passed.
- Update command metadata, capability metadata, scenarios, status, runbooks, and verification
  records when their source behavior changes.
- Run `pnpm docs:generate` after changing `docs/_meta/*.json`, then run `pnpm docs:check`.
- Record the exact command, environment, result, source revision or fingerprint, and limitations.
  Never report a skipped or not-run gate as passed.

## Git and review

- Follow the branch policy in [CONTRIBUTING.md](CONTRIBUTING.md). Never create a `codex/` branch.
- Do not commit or push unless the user authorizes it. Never force-push.
- Stage only intended files. Keep investigation logs, temporary reports, databases, and generated
  runtime state out of commits.
- A change is ready only when affected provider-consumer contracts, recovery impact, migration and
  data-retention impact, generated artifacts, focused tests, full required gates, and documentation
  evidence have been reviewed.
