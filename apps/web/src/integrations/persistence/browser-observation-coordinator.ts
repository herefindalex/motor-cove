import type { TransactionObservationCoordinator } from '../../capabilities/transactions/index.js';

const fallbackTails = new Map<string, Promise<void>>();
const nameFor = (deploymentId: string, clientOperationId: string) =>
  `motorcove:transaction-observation:v1:${deploymentId}:${clientOperationId}`;

export class BrowserTransactionObservationCoordinator implements TransactionObservationCoordinator {
  async run<T>(
    identity: { readonly deploymentId: string; readonly clientOperationId: string },
    options: { readonly wait: boolean },
    operation: () => Promise<T>,
  ): Promise<{ readonly acquired: false } | { readonly acquired: true; readonly result: T }> {
    const name = nameFor(identity.deploymentId, identity.clientOperationId);
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return navigator.locks.request(
        name,
        options.wait ? { mode: 'exclusive' } : { mode: 'exclusive', ifAvailable: true },
        async (lock) =>
          lock
            ? { acquired: true as const, result: await operation() }
            : { acquired: false as const },
      );
    }

    const previous = fallbackTails.get(name);
    if (previous && !options.wait) return { acquired: false };

    let release!: () => void;
    const completion = new Promise<void>((resolve) => {
      release = resolve;
    });
    const turn = previous ?? Promise.resolve();
    const tail = turn.then(() => completion);
    fallbackTails.set(name, tail);

    await turn;
    try {
      return { acquired: true, result: await operation() };
    } finally {
      release();
      if (fallbackTails.get(name) === tail) fallbackTails.delete(name);
    }
  }
}
