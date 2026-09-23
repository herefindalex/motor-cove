import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

const bytes32 = /^0x[0-9a-fA-F]{64}$/;
const decimal = /^(0|[1-9][0-9]*)$/;

export interface BootstrapReceipt {
  readonly formatVersion: 1;
  readonly environmentId: string;
  readonly deploymentId: string;
  readonly targetBlock: string;
  readonly targetHash: string;
  readonly projectionBuildId: string;
  readonly completedAt: string;
}

export function parseBootstrapReceipt(
  value: unknown,
  environmentId: string,
  deploymentId: string,
): BootstrapReceipt {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('BOOTSTRAP_RECEIPT_INVALID: object');
  }
  const row = value as Record<string, unknown>;
  if (
    row.formatVersion !== 1 ||
    row.environmentId !== environmentId ||
    typeof row.deploymentId !== 'string' ||
    !bytes32.test(row.deploymentId) ||
    row.deploymentId.toLowerCase() !== deploymentId.toLowerCase() ||
    typeof row.targetBlock !== 'string' ||
    !decimal.test(row.targetBlock) ||
    typeof row.targetHash !== 'string' ||
    !bytes32.test(row.targetHash) ||
    typeof row.projectionBuildId !== 'string' ||
    row.projectionBuildId.trim().length === 0 ||
    typeof row.completedAt !== 'string' ||
    !Number.isFinite(Date.parse(row.completedAt)) ||
    new Date(row.completedAt).toISOString() !== row.completedAt
  ) {
    throw new Error('BOOTSTRAP_RECEIPT_INVALID: schema or identity');
  }
  return row as unknown as BootstrapReceipt;
}

export function readBootstrapReceipt(
  path: string,
  environmentId: string,
  deploymentId: string,
): BootstrapReceipt {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    throw new Error('BOOTSTRAP_RECEIPT_INVALID: JSON');
  }
  return parseBootstrapReceipt(value, environmentId, deploymentId);
}

/** Publish a complete immutable JSON sidecar while the caller holds bootstrap ownership. */
export function publishImmutableJson<T>(
  path: string,
  value: T,
  validate: (value: unknown) => T,
  matchesExisting: (existing: T, proposed: T) => boolean,
): T {
  const proposed = validate(value);
  if (existsSync(path)) {
    let existing: T;
    try {
      existing = validate(JSON.parse(readFileSync(path, 'utf8')) as unknown);
    } catch {
      throw new Error('IMMUTABLE_SIDECAR_INVALID');
    }
    if (!matchesExisting(existing, proposed)) throw new Error('IMMUTABLE_SIDECAR_CONFLICT');
    return existing;
  }

  const directory = dirname(path);
  mkdirSync(directory, { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = openSync(temporary, 'wx', 0o600);
    try {
      writeFileSync(file, `${JSON.stringify(proposed, null, 2)}\n`);
      fsyncSync(file);
    } finally {
      closeSync(file);
    }
    if (existsSync(path)) throw new Error('IMMUTABLE_SIDECAR_CONFLICT');
    renameSync(temporary, path);
    const parent = openSync(directory, 'r');
    try {
      fsyncSync(parent);
    } finally {
      closeSync(parent);
    }
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  return proposed;
}
