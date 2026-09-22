import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { environmentPaths } from '@motorcove/database/environment';
import {
  acquireMaintenanceLocks,
  migrateEnvironment,
  recoverEnvironment,
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

  it('keeps an incomplete reindex blocked until the matching operation resumes', async () => {
    const paths = await fixture();
    const options = {
      operationType: 'REINDEX_PROJECTION' as const,
      expectedDeploymentId: `0x${'4'.repeat(64)}`,
      recovery: {
        reindexFromBlock: '105',
        targetBlock: '110',
        targetHash: `0x${'5'.repeat(64)}`,
      },
    };
    await expect(
      runProjectionMaintenance(paths, {
        ...options,
        run: (_database, maintenance) => {
          maintenance.recordProjectionPhase('CATCHING_UP');
          throw new Error('killed after rewind');
        },
      }),
    ).rejects.toThrow('killed after rewind');
    const original = readFileSync(paths.maintenancePath, 'utf8');
    const marker = JSON.parse(original) as { operationId: string; projectionPhase?: string };
    expect(marker.projectionPhase).toBe('CATCHING_UP');

    await expect(recoverEnvironment(paths, true)).resolves.toMatchObject({
      changed: false,
      status: 'ACTION_REQUIRED',
      action: 'RERUN_MATCHING_PROJECTION_OPERATION',
    });
    expect(readFileSync(paths.maintenancePath, 'utf8')).toBe(original);
    await expect(openProjectionWriter(paths)).rejects.toThrow('MAINTENANCE_INCOMPLETE');

    await expect(
      runProjectionMaintenance(paths, {
        ...options,
        run: (_database, maintenance) => {
          expect(maintenance.marker.projectionPhase).toBe('CATCHING_UP');
          return 'rebuilt';
        },
      }),
    ).resolves.toEqual({ operationId: marker.operationId, result: 'rebuilt' });
    expect(existsSync(paths.maintenancePath)).toBe(false);
  });

  it('transitions a source-incomplete rebuild to an explicitly authorized full reindex', async () => {
    const paths = await fixture();
    const deploymentId = `0x${'5'.repeat(64)}`;
    await expect(
      runProjectionMaintenance(paths, {
        operationType: 'REBUILD_PROJECTION',
        expectedDeploymentId: deploymentId,
        run: () => {
          throw new Error('REBUILD_SOURCE_INCOMPLETE: event evidence');
        },
      }),
    ).rejects.toThrow('REBUILD_SOURCE_INCOMPLETE');
    const failed = JSON.parse(readFileSync(paths.maintenancePath, 'utf8')) as {
      operationId: string;
    };

    await expect(
      runProjectionMaintenance(paths, {
        operationType: 'REINDEX_PROJECTION',
        expectedDeploymentId: deploymentId,
        recovery: {
          reindexFromBlock: '1',
          targetBlock: '2',
          targetHash: `0x${'6'.repeat(64)}`,
        },
        run: () => undefined,
      }),
    ).rejects.toThrow('MAINTENANCE_INCOMPLETE');

    await expect(
      runProjectionMaintenance(paths, {
        operationType: 'REINDEX_PROJECTION',
        expectedDeploymentId: deploymentId,
        sourceIncompleteRebuildTransition: { requiredReindexFromBlock: '0' },
        recovery: {
          reindexFromBlock: '1',
          targetBlock: '2',
          targetHash: `0x${'6'.repeat(64)}`,
        },
        run: () => undefined,
      }),
    ).rejects.toThrow('MAINTENANCE_INCOMPLETE');

    let transitionedMarker:
      | {
          operationId: string;
          transitionedFromOperationId?: string;
          transitionedFromOperationType?: string;
          transitionedFromLastError?: string;
        }
      | undefined;
    const result = await runProjectionMaintenance(paths, {
      operationType: 'REINDEX_PROJECTION',
      expectedDeploymentId: deploymentId,
      sourceIncompleteRebuildTransition: { requiredReindexFromBlock: '1' },
      recovery: {
        reindexFromBlock: '1',
        targetBlock: '2',
        targetHash: `0x${'6'.repeat(64)}`,
      },
      run: (_database, context) => {
        transitionedMarker = context.marker;
        return 'reindexed';
      },
    });

    expect(result.result).toBe('reindexed');
    expect(result.operationId).not.toBe(failed.operationId);
    expect(transitionedMarker).toMatchObject({
      operationId: result.operationId,
      transitionedFromOperationId: failed.operationId,
      transitionedFromOperationType: 'REBUILD_PROJECTION',
      transitionedFromLastError: 'REBUILD_SOURCE_INCOMPLETE: event evidence',
    });
    expect(existsSync(paths.maintenancePath)).toBe(false);
  });

  it('does not resume a projection marker with different recovery parameters', async () => {
    const paths = await fixture();
    const deploymentId = `0x${'6'.repeat(64)}`;
    await expect(
      runProjectionMaintenance(paths, {
        operationType: 'REINDEX_PROJECTION',
        expectedDeploymentId: deploymentId,
        recovery: { reindexFromBlock: '10', targetBlock: '12', targetHash: `0x${'7'.repeat(64)}` },
        run: () => {
          throw new Error('interrupted');
        },
      }),
    ).rejects.toThrow('interrupted');
    const original = readFileSync(paths.maintenancePath, 'utf8');

    await expect(
      runProjectionMaintenance(paths, {
        operationType: 'REINDEX_PROJECTION',
        expectedDeploymentId: deploymentId,
        recovery: { reindexFromBlock: '11', targetBlock: '12', targetHash: `0x${'7'.repeat(64)}` },
        run: () => undefined,
      }),
    ).rejects.toThrow('MAINTENANCE_INCOMPLETE');
    expect(readFileSync(paths.maintenancePath, 'utf8')).toBe(original);
  });

  it('releases maintenance locks after rejecting a mismatched marker', async () => {
    const paths = await fixture();
    await expect(
      runProjectionMaintenance(paths, {
        operationType: 'REINDEX_PROJECTION',
        expectedDeploymentId: `0x${'8'.repeat(64)}`,
        recovery: {
          reindexFromBlock: '1',
          targetBlock: '2',
          targetHash: `0x${'9'.repeat(64)}`,
        },
        run: () => {
          throw new Error('controlled failure');
        },
      }),
    ).rejects.toThrow('controlled failure');
    const original = readFileSync(paths.maintenancePath, 'utf8');

    await expect(
      runProjectionMaintenance(paths, {
        operationType: 'REINDEX_PROJECTION',
        expectedDeploymentId: `0x${'8'.repeat(64)}`,
        recovery: {
          reindexFromBlock: '1',
          targetBlock: '3',
          targetHash: `0x${'a'.repeat(64)}`,
        },
        run: () => undefined,
      }),
    ).rejects.toThrow('MAINTENANCE_INCOMPLETE');
    expect(readFileSync(paths.maintenancePath, 'utf8')).toBe(original);

    const locks = await acquireMaintenanceLocks(paths);
    await locks.release();
  });

  it('selects the recovery marker only after acquiring maintenance ownership', async () => {
    const paths = await fixture();
    const heldLocks = await acquireMaintenanceLocks(paths);
    const oldMarker = {
      operationId: 'old-restore',
      operationType: 'RESTORE',
      stage: 'FAILED',
      environmentId: paths.environmentId,
      targetDatabase: paths.databasePath,
    };
    writeFileSync(paths.maintenancePath, `${JSON.stringify(oldMarker)}\n`);

    await expect(recoverEnvironment(paths, true)).rejects.toThrow('RESOURCE_BUSY');

    const newMarker = {
      operationId: 'new-rebuild',
      operationType: 'REBUILD_PROJECTION',
      stage: 'FAILED',
      environmentId: paths.environmentId,
      targetDatabase: paths.databasePath,
    };
    const newMarkerBytes = `${JSON.stringify(newMarker)}\n`;
    writeFileSync(paths.maintenancePath, newMarkerBytes);
    await heldLocks.release();

    await expect(recoverEnvironment(paths, true)).resolves.toMatchObject({
      changed: false,
      status: 'ACTION_REQUIRED',
      marker: { operationId: 'new-rebuild' },
      action: 'RERUN_MATCHING_PROJECTION_OPERATION',
    });
    expect(readFileSync(paths.maintenancePath, 'utf8')).toBe(newMarkerBytes);
  });

  it('does not bypass ownership when no recovery marker exists', async () => {
    const paths = await fixture();
    const heldLocks = await acquireMaintenanceLocks(paths);
    const recovery = recoverEnvironment(paths, true);

    await expect(recovery).rejects.toThrow('RESOURCE_BUSY');
    await heldLocks.release();
    await expect(recoverEnvironment(paths, true)).resolves.toEqual({
      changed: false,
      status: 'NO_RECOVERY_REQUIRED',
    });
  });

  it('releases maintenance locks when marker JSON is invalid', async () => {
    const paths = await fixture();
    writeFileSync(paths.maintenancePath, '{');

    await expect(
      runProjectionMaintenance(paths, {
        operationType: 'REBUILD_PROJECTION',
        expectedDeploymentId: `0x${'b'.repeat(64)}`,
        run: () => undefined,
      }),
    ).rejects.toThrow();
    expect(readFileSync(paths.maintenancePath, 'utf8')).toBe('{');

    const locks = await acquireMaintenanceLocks(paths);
    await locks.release();
  });
});
