import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, resolve } from 'node:path';
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
  const temporary = `${path}.${marker.operationId}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(marker, null, 2)}\n`, {
      flag: 'wx',
      flush: true,
    });
    renameSync(temporary, path);
    syncDirectory(path);
  } catch (error) {
    try {
      if (existsSync(temporary)) unlinkSync(temporary);
    } catch {
      // The original filesystem failure is the actionable error. A unique leftover cannot block retry.
    }
    throw error;
  }

  const prefix = `${basename(path)}.${marker.operationId}.`;
  for (const name of readdirSync(dirname(path))) {
    if (!name.startsWith(prefix) || !name.endsWith('.tmp')) continue;
    try {
      unlinkSync(resolve(dirname(path), name));
    } catch {
      // Published marker bytes are authoritative; an orphan with a unique name is safe to ignore.
    }
  }
}

export function clearMaintenanceMarker(path: string): void {
  if (!existsSync(path)) return;
  unlinkSync(path);
  syncDirectory(path);
}
