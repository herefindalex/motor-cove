import { inspectEnvironment } from '@motorcove/database/maintenance';
import { output, target } from './args.js';
output(inspectEnvironment(target()));
