# Implementation and documentation plan

This page aligns the original P0–P5, Database D0–D5, and Documentation DOC-P0–DOC-P5 work without
creating a competing roadmap. Checked items have inspected implementation and current evidence.
Remaining limits are named on the item that owns them.

## Product P0–P5

- [x] **P0:** Workspace, strict TypeScript boundaries, architecture graph, and negative fixtures.
- [x] **P1:** ERC-721 escrow listing/funding/settlement, pull claims, refund, withdraw, and reclaim.
- [x] **P2:** Local deployment, event ingestion, managed SQLite projection, readonly API, and
      provenance.
- [x] **P3:** Frontend feature/capability/adapter implementation and durable transaction observation.
- [x] **P4:** Catch-up, replay, rebuild, reindex, replacement/reorg recovery, reset, backup catch-up,
      and anchored sale/token reconciliation. Local process and controlled SQLite fault cases passed;
      hardware power loss and public-network history remain outside local evidence.
- [x] **P5:** Local and declared CI gates, ownership, collaboration docs, demo, and evidence.
      Remote branch protection, final reviewer identities, and manual wallet evidence remain
      owner-controlled checks.

## Database D0–D5

- [x] **D0:** Existing database/history inspected read-only; non-adoption environment boundaries
      recorded.
- [x] **D1:** One database package, schema, codecs, managed paths, role exports, locks, and marker.
- [x] **D2:** Native migration history, source digest, runtime checks, injected SQL rollback, and
      failure-marker recovery passed. DB-03 waits for the first truthful prior-schema change.
- [x] **D3:** Catalog seed, durable chain-step journal, known-hash resume, seed-version conflict, and
      completed-bootstrap reuse passed. A real process kill in the broadcast-to-hash window remains a
      stated operating-system fault-injection gap.
- [x] **D4:** Backup/restore, rebuild/reindex, reorg evidence retention, restore-behind-head catch-up,
      reconciliation, one-snapshot reads, and reset deployment mismatch detection passed locally.
- [x] **D5:** Commands, runbooks, local full-stack drills, reset refusal matrix, and parallel suite
      isolation passed. The DB-01–DB-54 matrix preserves DB-03 and hardware-level limits.

## Documentation DOC-P0–DOC-P5

- [x] **DOC-P0:** Repository, scripts, tests, lockfile, CI, and existing documents inventoried.
- [x] **DOC-P1:** Bilingual entry points, scope, status, capability/evidence map, and navigation.
- [x] **DOC-P2:** Architecture, dependency rules, data authority, protocol, transaction, and
      provider-consumer documentation.
- [x] **DOC-P3:** Onboarding, ownership, parallel development, and change recipes.
- [x] **DOC-P4:** Testing strategy, scenario matrix, demo, runbooks, CI gates, and evidence records.
- [x] **DOC-P5:** Link, name, command, generated-drift, bilingual parity, and false-evidence checks;
      DOC-01–DOC-32 are tracked in the acceptance matrix.

See [implementation status](implementation-status.md),
[scenario catalog](testing/scenario-catalog.md),
[database matrix](testing/database-acceptance-matrix.md), and
[documentation matrix](testing/documentation-acceptance-matrix.md).
