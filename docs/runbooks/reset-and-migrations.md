# Database changes and local reset

Migration and reset have different authority and safety boundaries.

- Use [database migrations](database-migrations.md) for forward-only schema history.
- Use [local reset](local-reset.md) only for a disposable owned demo.
- Use [backup, restore, and recovery](backup-restore-and-recovery.md) for data preservation.
