import { renameSync, writeFileSync } from 'node:fs';

const [temporaryPath, readyPath, markerJson] = process.argv.slice(2);
if (!temporaryPath || !readyPath || !markerJson)
  throw new Error('ORPHAN_MARKER_TEMP_ARGUMENTS_REQUIRED');

writeFileSync(temporaryPath, `${markerJson}\n`, { flag: 'wx', flush: true });
const readyTemporaryPath = `${readyPath}.${process.pid}.tmp`;
writeFileSync(readyTemporaryPath, 'ready\n', { flag: 'wx', flush: true });
renameSync(readyTemporaryPath, readyPath);

await new Promise<never>(() => {
  setInterval(() => undefined, 60_000);
});
