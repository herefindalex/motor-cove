import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import type { MaintenanceMarker } from '../types/index.js';

function syncDirectory(path: string): void {
  const descriptor = openSync(dirname(path), 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function assertMaintenanceComplete(path: string): void {
  if (existsSync(path)) throw new Error('MAINTENANCE_INCOMPLETE');
}

export function writeMaintenanceMarker(path: string, marker: MaintenanceMarker): void {
  const temporary = `${path}.${marker.operationId}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(marker, null, 2)}\n`, { flag: 'wx', flush: true });
  renameSync(temporary, path);
  syncDirectory(path);
}

export function clearMaintenanceMarker(path: string): void {
  if (!existsSync(path)) return;
  unlinkSync(path);
  syncDirectory(path);
}
