# How to inspect MotorCove locally

Use this runbook to inspect source, run safe checks, and start an isolated local stack.

## Prerequisites

Linux/WSL2, Node 24.21.0, pnpm 12.5.1, and Foundry/Anvil 1.8.3. Keep public RPC URLs, real keys,
real ETH, and valuable assets out of the environment.

## Safe inspection

```bash
nvm use
pnpm install --frozen-lockfile
pnpm doctor
pnpm docs:check
pnpm db:check
```

These commands do not start Anvil or open an existing MotorCove data environment. `db:check` uses a
temporary SQLite database.

## Local demo

Choose a fresh environment ID. Runtime state is written under `.motorcove/environments/<id>`; the
deployment manifest remains a generated local artifact. In separate terminals run:

```bash
export MOTORCOVE_ENV=demo-local
pnpm dev:chain
pnpm dev:bootstrap
pnpm dev:full
```

Follow [seeding and bootstrap](seeding-and-bootstrap.md) for identity and rerun behavior. Do not
reset or adopt the existing `data/motorcove.sqlite`.

## Verification and stop conditions

`pnpm docs:smoke` runs only repository checks and temporary SQLite suites. A full local demo is ready
only after bootstrap records a deployment, catalog bindings, target block/hash, one-shot catch-up,
and a bootstrap receipt in the same owned environment. Ambiguous chain broadcast recovery remains a
documented gap.

Stop on deployment mismatch, maintenance marker, unknown seed result, schema/history divergence, or
public/non-loopback RPC. See [project scope](../project-scope.md) and
[backup/recovery](backup-restore-and-recovery.md).
