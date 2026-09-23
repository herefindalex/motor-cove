import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  backupEnvironment,
  parseBootstrapReceipt,
  publishImmutableJson,
  verifyBackup,
} from '@motorcove/database/maintenance';
import { databaseFixture, hashes } from '../helpers/database.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const account = `0x${'1'.repeat(40)}`;
const timestamp = '2026-09-23T00:00:00.000Z';

function validSeedJournal(environmentId: string) {
  return {
    formatVersion: 1,
    environmentId,
    chainId: 31_337,
    account,
    deploymentId: hashes.deployment,
    createdAt: timestamp,
    updatedAt: timestamp,
    steps: {},
  };
}

function validReceipt(environmentId: string) {
  return {
    formatVersion: 1,
    environmentId,
    deploymentId: hashes.deployment,
    targetBlock: '1',
    targetHash: hashes.block,
    projectionBuildId: 'build-test',
    completedAt: timestamp,
  };
}

describe('R25 bootstrap completion evidence', () => {
  it('rejects malformed receipt JSON instead of treating file existence as completion', async () => {
    const { root, paths } = await databaseFixture('r25-malformed-receipt');
    roots.push(root);
    writeFileSync(
      paths.seedJournalPath,
      `${JSON.stringify(validSeedJournal(paths.environmentId))}\n`,
    );
    writeFileSync(paths.bootstrapReceiptPath, '{"formatVersion":1');

    await expect(backupEnvironment(paths)).rejects.toThrow('BACKUP_INVALID: bootstrap receipt');
  });

  it('rejects a receipt for another deployment', async () => {
    const { root, paths } = await databaseFixture('r25-wrong-deployment-receipt');
    roots.push(root);
    writeFileSync(
      paths.seedJournalPath,
      `${JSON.stringify(validSeedJournal(paths.environmentId))}\n`,
    );
    writeFileSync(
      paths.bootstrapReceiptPath,
      `${JSON.stringify({
        ...validReceipt(paths.environmentId),
        deploymentId: `0x${'f'.repeat(64)}`,
      })}\n`,
    );

    await expect(backupEnvironment(paths)).rejects.toThrow('BACKUP_INVALID: bootstrap receipt');
  });

  it('rejects a receipt for another environment', async () => {
    const { root, paths } = await databaseFixture('r25-wrong-environment-receipt');
    roots.push(root);
    writeFileSync(
      paths.seedJournalPath,
      `${JSON.stringify(validSeedJournal(paths.environmentId))}\n`,
    );
    writeFileSync(
      paths.bootstrapReceiptPath,
      `${JSON.stringify(validReceipt('other-environment'))}\n`,
    );

    await expect(backupEnvironment(paths)).rejects.toThrow('BACKUP_INVALID: bootstrap receipt');
  });

  it('rejects malformed target evidence', async () => {
    const { root, paths } = await databaseFixture('r25-invalid-target-receipt');
    roots.push(root);
    writeFileSync(
      paths.seedJournalPath,
      `${JSON.stringify(validSeedJournal(paths.environmentId))}\n`,
    );
    writeFileSync(
      paths.bootstrapReceiptPath,
      `${JSON.stringify({
        ...validReceipt(paths.environmentId),
        targetBlock: '-1',
        targetHash: 'not-a-hash',
      })}\n`,
    );

    await expect(backupEnvironment(paths)).rejects.toThrow('BACKUP_INVALID: bootstrap receipt');
  });

  it('accepts schema-valid completion evidence bound to this environment and deployment', async () => {
    const { root, paths } = await databaseFixture('r25-valid-receipt');
    roots.push(root);
    writeFileSync(
      paths.seedJournalPath,
      `${JSON.stringify(validSeedJournal(paths.environmentId))}\n`,
    );
    writeFileSync(
      paths.bootstrapReceiptPath,
      `${JSON.stringify(validReceipt(paths.environmentId))}\n`,
    );

    await expect(backupEnvironment(paths)).resolves.toMatchObject({
      manifest: { restorePolicy: 'STANDARD' },
    });
  });

  it('publishes one validated final receipt and preserves it across resume or conflict', async () => {
    const { root, paths } = await databaseFixture('r25-publish-receipt');
    roots.push(root);
    const candidate = validReceipt(paths.environmentId);
    const validate = (value: unknown) =>
      parseBootstrapReceipt(value, paths.environmentId, hashes.deployment);
    const matches = (left: typeof candidate, right: typeof candidate) =>
      left.targetBlock === right.targetBlock && left.targetHash === right.targetHash;
    publishImmutableJson(paths.bootstrapReceiptPath, candidate, validate, matches);
    const original = readFileSync(paths.bootstrapReceiptPath, 'utf8');
    expect(readdirSync(paths.environmentDir).filter((name) => name.endsWith('.tmp'))).toEqual([]);

    const resumed = publishImmutableJson(
      paths.bootstrapReceiptPath,
      { ...candidate, projectionBuildId: 'later-rebuild', completedAt: '2026-09-23T01:00:00.000Z' },
      validate,
      matches,
    );
    expect(resumed.projectionBuildId).toBe('build-test');
    expect(readFileSync(paths.bootstrapReceiptPath, 'utf8')).toBe(original);
    expect(() =>
      publishImmutableJson(
        paths.bootstrapReceiptPath,
        { ...candidate, targetHash: `0x${'f'.repeat(64)}` },
        validate,
        matches,
      ),
    ).toThrow('IMMUTABLE_SIDECAR_CONFLICT');
    expect(readFileSync(paths.bootstrapReceiptPath, 'utf8')).toBe(original);

    writeFileSync(paths.bootstrapReceiptPath, '{"formatVersion":1');
    expect(() =>
      publishImmutableJson(paths.bootstrapReceiptPath, candidate, validate, matches),
    ).toThrow('IMMUTABLE_SIDECAR_INVALID');
  });

  it('rejects a legacy backup whose receipt checksum is valid but receipt schema is not', async () => {
    const { root, paths } = await databaseFixture('r25-legacy-invalid-receipt');
    roots.push(root);
    writeFileSync(
      paths.seedJournalPath,
      `${JSON.stringify(validSeedJournal(paths.environmentId))}\n`,
    );
    writeFileSync(
      paths.bootstrapReceiptPath,
      `${JSON.stringify(validReceipt(paths.environmentId))}\n`,
    );
    const backup = await backupEnvironment(paths);
    const receiptPath = resolve(backup.path, 'bootstrap-receipt.json');
    writeFileSync(receiptPath, '{"formatVersion":1');
    const manifestPath = resolve(backup.path, 'backup-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      sidecars: { bootstrapReceipt: { present: boolean; sha256: string } };
    };
    manifest.sidecars.bootstrapReceipt.sha256 = createHash('sha256')
      .update(readFileSync(receiptPath))
      .digest('hex');
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
    expect(() => verifyBackup(paths, backup.backupId)).toThrow('BACKUP_INVALID: bootstrap receipt');
  });
});
