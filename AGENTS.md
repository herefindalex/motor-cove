# MotorCove agent guide

The implementation brief under `docs/internal/` is authoritative. Use English in project files.

- Preserve boundaries checked by `pnpm check:architecture`; add a negative fixture when adding a rule.
- Web features depend on capability public APIs and ports. SDK adapters live under `integrations/`.
- Database access uses `@motorcove/database/reader`, `/projection-writer`, `/maintenance`, and `/types`.
  Do not create a second database access or migration path.
- Contract events, ABI, API schemas, DB schema, and deployment manifest are provider contracts.
- Run `pnpm generate` after Solidity/schema metadata changes and commit deterministic artifacts.
- Never use public networks or real keys. Never commit `data/` or `deployments/local/`.
- Stop API and Indexer before maintenance. Rebuild preserves catalog; reset and restore have
  separate guarded semantics.
- Public docs are English. Keep required, implemented, and verified states separate. Run
  `pnpm docs:generate && pnpm docs:check` after capability, command, scenario, or evidence changes.
- Required gates: `pnpm verify` and `pnpm test:e2e`; never report a not-run gate as passed.
