import { migrateEnvironment } from '@motorcove/database/maintenance';
import { output, target } from './args.js';
output(await migrateEnvironment(target()));
