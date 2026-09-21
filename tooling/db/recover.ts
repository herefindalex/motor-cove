import { recoverEnvironment } from '@motorcove/database/maintenance';
import { flag, output, target } from './args.js';
output(await recoverEnvironment(target(), flag('complete')));
