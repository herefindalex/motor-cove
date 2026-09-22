# ADR 0019: Maintenance marker publication and snapshot readiness

- **Status:** accepted
- **Date:** 2026-09-22

## Context

Maintenance state lives outside SQLite because it must block runtime startup after a process dies.
The marker writer previously reused one temporary filename for every update in an operation. A
process killed after the temporary file was flushed but before rename left that filename occupied,
so the same operation could never publish `ACTIVE` or `FAILED` on retry.

SQLite backup also proved database integrity and deployment identity without recording whether the
source was inside unfinished maintenance. A consistent snapshot taken between reindex phases could
therefore pass backup verification after its external marker was gone, even though it represented
diagnostic evidence rather than a normal service-ready restore point.

## Decision

1. Every marker update uses a new exclusive temporary filename. The published
   `maintenance.json` remains the only committed operation state. After a successful atomic replace,
   the lock-owning writer removes orphan temporary files for the same operation. A failed rename
   removes its own temporary file when possible and preserves the original filesystem error.
2. A standard backup refuses to run while any maintenance marker exists. Internal migration safety
   and source refresh archive calls must provide the current operation ID and a fixed purpose that
   matches the durable marker.
3. Backup format 3 records `sourceCondition`, `restorePolicy`, and projection evidence from the
   snapshot. A maintenance source produces an `EVIDENCE_ONLY` archive with operation identity,
   marker digest, stage, purpose, and projection phase. Checkpoint, build, scope, projection status,
   and recovery reason are recomputed from the database during verification.
4. The normal restore command accepts only `STANDARD` snapshots created from a source with no
   maintenance marker. Evidence-only archives remain available to the operation that required them
   and for diagnosis, but cannot silently remove the runtime gate by becoming an ordinary restore.

## Consequences

- A killed marker publication cannot strand an otherwise matching maintenance resume on `EEXIST`.
- The formal marker is authoritative; unpublished temporary bytes never advance operation state.
- Migration and source refresh retain verified backup evidence without presenting an intermediate
  projection as service-ready.
- Older backup formats fail closed under the current verifier. This project has no released backup
  compatibility contract; retained internal evidence must be interpreted with the code that created
  it.

## Verification

- `tests/database/projection-maintenance.test.ts` kills a real child after it flushes the old
  fixed-name temporary marker and verifies the matching operation resumes exactly once.
- `tests/recovery/backup-restore.test.ts` verifies standard backup refusal under an incomplete marker,
  maintenance evidence classification, projection evidence verification, and restore refusal before
  quarantine.
- Migration, database, recovery, and Indexer integration gates exercise the existing internal backup
  callers with their explicit operation context.
