import { restoreEnvironment } from '@motorcove/database/maintenance';
import { flag, output, required, target } from './args.js';
output(await restoreEnvironment(target(), required('backup'), flag('yes')));
