import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { environmentPaths } from '@motorcove/database/environment';
import {
  acquireMaintenanceLocks,
  migrateEnvironment,
  runProjectionMaintenance,
} from '@motorcove/database/maintenance';
import { openProjectionWriter } from '@motorcove/database/projection-writer';

const roots: string[] = [];

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'motorcove-projection-maintenance-'));
  roots.push(root);
  const paths = environmentPaths(root, 'maintenance');
  await migrateEnvironment(paths);
  return paths;
}

describe('projection maintenance isolation', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('rejects before writing a marker when a runtime service owns the environment', async () => {
    const paths = await fixture();
    const writer = await openProjectionWriter(paths);
    try {
      await expect(
        runProjectionMaintenance(paths, {
          operationType: 'REBUILD_PROJECTION',
          expectedDeploymentId: `0x${'1'.repeat(64)}`,
          run: () => undefined,
        }),
      ).rejects.toThrow('RESOURCE_BUSY');
      expect(existsSync(paths.maintenancePath)).toBe(false);
    } finally {
      await writer.close();
    }
  });

  it('blocks runtime startup while maintenance is active and clears its marker on success', async () => {
    const paths = await fixture();
    let releaseOperation!: () => void;
    const operationWaiting = new Promise<void>((resolve) => {
      releaseOperation = resolve;
    });
    let operationStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      operationStarted = resolve;
    });
    const operation = runProjectionMaintenance(paths, {
      operationType: 'REINDEX_PROJECTION',
      expectedDeploymentId: `0x${'2'.repeat(64)}`,
      run: async () => {
        operationStarted();
        await operationWaiting;
        return 'done';
      },
    });
    await started;
    expect(existsSync(paths.maintenancePath)).toBe(true);
    await expect(openProjectionWriter(paths)).rejects.toThrow('RESOURCE_BUSY');
    releaseOperation();
    await expect(operation).resolves.toMatchObject({ result: 'done' });
    expect(existsSync(paths.maintenancePath)).toBe(false);
  });

  it('retains a failed marker after an interrupted maintenance operation', async () => {
    const paths = await fixture();
    await expect(
      runProjectionMaintenance(paths, {
        operationType: 'REBUILD_PROJECTION',
        expectedDeploymentId: `0x${'3'.repeat(64)}`,
        run: () => {
          throw new Error('controlled rebuild failure');
        },
      }),
    ).rejects.toThrow('controlled rebuild failure');

    const marker = JSON.parse(readFileSync(paths.maintenancePath, 'utf8')) as {
      stage: string;
      lastError: string;
    };
    expect(marker).toMatchObject({ stage: 'FAILED', lastError: 'controlled rebuild failure' });
    await expect(openProjectionWriter(paths)).rejects.toThrow('MAINTENANCE_INCOMPLETE');

    const locks = await acquireMaintenanceLocks(paths);
    await locks.release();
  });
});
