# How to inspect MotorCove locally

Use this runbook to inspect source, run safe checks, and start a new isolated local stack.

## Prerequisites

Use Linux or WSL2 with Node 24.21.0, pnpm 12.5.1, Foundry/Anvil 1.8.3, and SQLite 3. Keep public
RPC URLs, real keys, real ETH, and valuable assets out of this environment.

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

## Start an isolated demo

Choose a fresh environment ID. Runtime state is written under `.motorcove/environments/<id>`; the
deployment manifest is a generated local artifact. Do not adopt or reset an existing database.

Terminal 1:

```bash
nvm use
export MOTORCOVE_ENV=demo-local
pnpm dev:chain
```

After Anvil is ready, terminal 2:

```bash
nvm use
export MOTORCOVE_ENV=demo-local
pnpm dev:bootstrap
VITE_MOTORCOVE_DEMO_WALLET=1 pnpm dev:full
```

Open <http://127.0.0.1:5173>. The explicit demo flag adds **Use local seller** and **Use local buyer**
connectors. They use unlocked Anvil accounts and send real transactions through Wagmi and Viem. The
flag is honored only by the Vite development server, and startup fails if its RPC is not loopback.
Only public test addresses are present in the bundle; no private key is embedded.

The API accepts this exact browser origin by default. If the UI is deliberately served from a
different origin, set `MOTORCOVE_WEB_ORIGIN` to that one origin before starting the API. The
`localhost` spelling is a different origin and is not allowed by the default CORS policy.

Leave `VITE_MOTORCOVE_DEMO_WALLET` unset when testing an injected wallet. Configure that wallet with
RPC `http://127.0.0.1:8545`, chain ID `31337`, and only an Anvil test account.

## Click through the completed sale path

1. Choose **Use local buyer**.
2. On **Apex GT**, click **Fund exactly** and wait for `FUNDED`.
3. Click **Complete sale** and wait for `COMPLETED`.
4. Click **Disconnect**, then **Use local seller**.
5. Click **Withdraw proceeds** and wait for `WITHDRAWN`.

The transaction timeline shows wallet request, submitted hash, receipt, and projection evidence as
separate states. Follow the [demo walkthrough](../demo/walkthrough.md) for the other sale outcomes.

## Stop conditions

A full local demo is ready only after bootstrap records deployment identity, catalog bindings, target
block/hash, one-shot catch-up, and its receipt in the same owned environment. Stop on deployment
mismatch, a maintenance marker, unknown seed result, schema/history divergence, or a
public/non-loopback RPC. See [seeding and bootstrap](seeding-and-bootstrap.md),
[project scope](../project-scope.md), and [backup and recovery](backup-restore-and-recovery.md).
