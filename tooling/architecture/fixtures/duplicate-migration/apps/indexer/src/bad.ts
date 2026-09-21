import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

export const forbiddenMigrationRunner = migrate;
