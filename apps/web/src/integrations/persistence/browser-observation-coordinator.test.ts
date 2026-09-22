// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserTransactionObservationCoordinator } from './browser-observation-coordinator.js';

const deploymentId = `0x${'1'.repeat(64)}`;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function identity(clientOperationId: string) {
  return { deploymentId, clientOperationId };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BrowserTransactionObservationCoordinator fallback', () => {
  it('skips a second automatic observer for the same operation', async () => {
    const firstCoordinator = new BrowserTransactionObservationCoordinator();
    const secondCoordinator = new BrowserTransactionObservationCoordinator();
    const release = deferred<undefined>();
    const first = firstCoordinator.run(identity('operation-a'), { wait: false }, async () => {
      await release.promise;
      return 'first';
    });

    await expect(
      secondCoordinator.run(identity('operation-a'), { wait: false }, async () => 'second'),
    ).resolves.toEqual({ acquired: false });

    release.resolve(undefined);
    await expect(first).resolves.toEqual({ acquired: true, result: 'first' });
    await expect(
      secondCoordinator.run(identity('operation-a'), { wait: false }, async () => 'third'),
    ).resolves.toEqual({ acquired: true, result: 'third' });
  });

  it('queues a manual observation until the current owner releases', async () => {
    const firstCoordinator = new BrowserTransactionObservationCoordinator();
    const secondCoordinator = new BrowserTransactionObservationCoordinator();
    const release = deferred<undefined>();
    const events: string[] = [];
    const first = firstCoordinator.run(identity('operation-b'), { wait: false }, async () => {
      events.push('first-start');
      await release.promise;
      events.push('first-end');
    });
    const manual = secondCoordinator.run(identity('operation-b'), { wait: true }, async () => {
      events.push('manual');
      return 'checked';
    });

    await Promise.resolve();
    expect(events).toEqual(['first-start']);
    release.resolve(undefined);
    await expect(first).resolves.toMatchObject({ acquired: true });
    await expect(manual).resolves.toEqual({ acquired: true, result: 'checked' });
    expect(events).toEqual(['first-start', 'first-end', 'manual']);
  });

  it('releases ownership after the operation rejects', async () => {
    const coordinator = new BrowserTransactionObservationCoordinator();
    await expect(
      coordinator.run(identity('operation-c'), { wait: false }, async () => {
        throw new Error('RPC unavailable');
      }),
    ).rejects.toThrow('RPC unavailable');

    await expect(
      coordinator.run(identity('operation-c'), { wait: false }, async () => 'recovered'),
    ).resolves.toEqual({ acquired: true, result: 'recovered' });
  });

  it('allows different operations to run concurrently', async () => {
    const coordinator = new BrowserTransactionObservationCoordinator();
    const release = deferred<undefined>();
    const first = coordinator.run(identity('operation-d'), { wait: false }, async () => {
      await release.promise;
      return 'first';
    });

    await expect(
      coordinator.run(identity('operation-e'), { wait: false }, async () => 'second'),
    ).resolves.toEqual({ acquired: true, result: 'second' });
    release.resolve(undefined);
    await expect(first).resolves.toEqual({ acquired: true, result: 'first' });
  });
});
