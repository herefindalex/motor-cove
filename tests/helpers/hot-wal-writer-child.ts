import Database from 'better-sqlite3';
import { writeFileSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';

const [databasePath, readyPath] = process.argv.slice(2);
if (!databasePath || !readyPath) throw new Error('HOT_WAL_WRITER_ARGS');

const database = new Database(databasePath);
database.pragma('journal_mode = WAL');
database.pragma('wal_autocheckpoint = 0');
database.prepare("UPDATE catalog_vehicles SET name='ACTIVE_VALUE' WHERE catalog_id='kept'").run();
writeFileSync(readyPath, 'ready\n');

await wait(60_000);
database.close();
