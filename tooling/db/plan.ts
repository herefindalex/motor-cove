import { inspectEnvironment } from '@motorcove/database/maintenance';
import { output, target } from './args.js';
const status = inspectEnvironment(target());
output({
  ...status,
  command: 'db:plan',
  risk: status.databaseExists ? 'BACKUP_REQUIRED_IF_PENDING' : 'FRESH_INSTALL',
});
