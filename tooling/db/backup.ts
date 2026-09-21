import { backupEnvironment } from '@motorcove/database/maintenance';
import { output, target } from './args.js';
output(await backupEnvironment(target()));
