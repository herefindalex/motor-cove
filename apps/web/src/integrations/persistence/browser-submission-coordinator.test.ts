// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BrowserTransactionSubmissionCoordinator } from './browser-submission-coordinator.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('BrowserTransactionSubmissionCoordinator fallback', () => {
  it('rejects a concurrent owner for the same immutable intent', async () => {
    const firstCoordinator = new BrowserTransactionSubmissionCoordinator();
    const secondCoordinator = new BrowserTransactionSubmissionCoordinator();
    const release = deferred<undefined>();
    const first = firstCoordinator.run('intent-a', async () => {
      await release.promise;
      return 'first';
    });

    await expect(secondCoordinator.run('intent-a', async () => 'second')).resolves.toEqual({
      acquired: false,
    });
    release.resolve(undefined);
    await expect(first).resolves.toEqual({ acquired: true, result: 'first' });
  });

  it('releases ownership after success and failure', async () => {
    const coordinator = new BrowserTransactionSubmissionCoordinator();
    await expect(coordinator.run('intent-b', async () => 'done')).resolves.toEqual({
      acquired: true,
      result: 'done',
    });
    await expect(
      coordinator.run('intent-b', async () => {
        throw new Error('simulation failed');
      }),
    ).rejects.toThrow('simulation failed');
    await expect(coordinator.run('intent-b', async () => 'retried')).resolves.toEqual({
      acquired: true,
      result: 'retried',
    });
  });

  it('keeps different immutable intents independent', async () => {
    const coordinator = new BrowserTransactionSubmissionCoordinator();
    const release = deferred<undefined>();
    const first = coordinator.run('intent-c', async () => {
      await release.promise;
      return 'first';
    });

    await expect(coordinator.run('intent-d', async () => 'second')).resolves.toEqual({
      acquired: true,
      result: 'second',
    });
    release.resolve(undefined);
    await expect(first).resolves.toEqual({ acquired: true, result: 'first' });
  });
});
