import Database from 'better-sqlite3';
import {
  acquireMaintenanceLocks,
  verifyDatabase,
  verifyOwnedEnvironment,
} from '@motorcove/database/maintenance';
import { output, target } from './args.js';
const paths = target();
verifyOwnedEnvironment(paths);
const locks = await acquireMaintenanceLocks(paths);
try {
  const db = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
  try {
    output({ environmentId: paths.environmentId, ...verifyDatabase(db) });
  } finally {
    db.close();
  }
} finally {
  await locks.release();
}
