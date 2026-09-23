# ADR 0027: Recovery barrier and bootstrap evidence publication

- Status: Accepted
- Date: 2026-09-23

## Context

`RECOVERY_REQUIRED` records confirmed projection integrity evidence. A temporary transport failure,
ordinary commit, or runtime restart must not erase it. The maintenance marker separately owns an
in-progress rebuild or reindex. Bootstrap receipt and deployment sidecars also need complete,
identity-bound content: file existence and a matching checksum alone do not establish completion.
Finally, replaying a local journal does not observe the live chain and must not renew RPC freshness.

## Decision

Normal projection writers refuse startup while `RECOVERY_REQUIRED` is persisted. Ordinary stale and
current transitions preserve that state, and an ordinary commit rejects before changing source,
projection, or checkpoint rows. Maintenance orchestration reads the persisted reason under its
exclusive gate before publishing a marker. Canonical or source suspicion permits reindex; a
projector-only integrity reason permits rebuild after local source verification. Unsupported rebuild
requests leave the existing marker and projection unchanged.

Reconciliation remains available as a diagnostic report under its own maintenance gate. It may read
the projection and save an `UNVERIFIABLE` report without opening the ordinary projection writer or
clearing recovery evidence.

Reindex holds the recovery reason through rewind, local replay, and catch-up. Its maintenance-owned
store may commit while that reason remains persisted. Only a reached canonical target releases the
barrier to `SYNCING`; the next live observation establishes whether it is `CURRENT`. A failed
maintenance callback restores the prior barrier and leaves a failed marker. A projector-only rebuild
may publish its rebuilt projection after source verification and a successful local transaction.

Bootstrap receipt content is parsed against format version, environment, deployment, target, build
ID, and timestamp. Receipt and deployment manifest publication writes a unique temporary file,
flushes it, renames it into place, and syncs the parent directory. A pre-existing final file is
validated; conflicting or malformed content is rejected. An existing bootstrap receipt remains
historical evidence even if a later legitimate projection rebuild changes the current build ID.
Its target block and hash also remain the original completion anchor when later transactions advance
the chain head. Standard deployed backups require the paired seed journal and a valid receipt. Backup verification
checks the copied receipt again, even when its recorded checksum matches.

Local `rebuildFromJournal()` no longer advances `worker_heartbeat_at`. A successful local projection
rebuild and a fresh RPC observation are distinct claims; readers may still present stale observation
freshness until the worker polls the chain.

## Verification

R25 regression tests cover barrier persistence, maintenance eligibility and postconditions,
reindex replay, receipt publication and backup validation, and local rebuild freshness. The
verification record distinguishes focused tests, full local gates, and browser evidence.
