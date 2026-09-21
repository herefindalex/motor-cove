# ADR 0004: Stop on ambiguous chain seed outcomes

## Status

Accepted.

## Context

Local bootstrap sends non-idempotent contract deployment, mint, approval, and listing transactions.
A process can stop after an RPC node accepted a transaction but before the caller durably records
its hash. Sending the same logical step again can create another contract, mint another token, or
open another sale. An EVM transaction does not provide an application-level exactly-once guarantee.

## Decision

Bootstrap uses one environment-owned `seed-journal.json` and binds it to the environment, chain ID,
sender account, deployment ID, and immutable intent digest for each logical step.

- Persist `PREPARED` before asking the wallet client to submit.
- Persist `SUBMITTED` with the returned transaction hash before waiting for a receipt.
- Mark `VERIFIED` only after a successful receipt is durable.
- On rerun, use a known submitted hash and revalidate a verified receipt without submitting again.
- Treat a stranded `PREPARED` step or a submit call with an unknown outcome as `UNKNOWN` and stop.
- Reject identity changes, intent changes, and changed verified receipt evidence.
- Once a deployment manifest exists, verify its chain identity and perform database catch-up without
  sending seed transactions.

Operators preserve the journal while investigating. Returning to a fresh demonstration state uses
the guarded reset workflow for a disposable owned environment.

## Consequences

The common retry paths are deterministic and completed bootstrap does not overwrite later user
actions. An ambiguous broadcast can require manual evidence review or an explicit reset. The design
does not claim exactly-once chain transactions, and a real process kill in the broadcast-to-hash
persistence window remains a separate fault-injection test.
