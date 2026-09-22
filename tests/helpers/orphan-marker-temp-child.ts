import { writeFileSync } from 'node:fs';

const [temporaryPath, readyPath, markerJson] = process.argv.slice(2);
if (!temporaryPath || !readyPath || !markerJson)
  throw new Error('ORPHAN_MARKER_TEMP_ARGUMENTS_REQUIRED');

writeFileSync(temporaryPath, `${markerJson}\n`, { flag: 'wx', flush: true });
writeFileSync(readyPath, 'ready\n', { flag: 'wx', flush: true });

await new Promise<never>(() => undefined);
