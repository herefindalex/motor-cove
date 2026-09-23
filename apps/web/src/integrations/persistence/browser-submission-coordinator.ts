import type { TransactionSubmissionCoordinator } from '../../capabilities/transactions/index.js';

const fallbackOwners = new Set<string>();
const nameFor = (intentKey: string) => `motorcove:transaction-submission:v1:${intentKey}`;

export class BrowserTransactionSubmissionCoordinator implements TransactionSubmissionCoordinator {
  async run<T>(
    intentKey: string,
    operation: () => Promise<T>,
  ): Promise<{ readonly acquired: false } | { readonly acquired: true; readonly result: T }> {
    const name = nameFor(intentKey);
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return navigator.locks.request(
        name,
        { mode: 'exclusive', ifAvailable: true },
        async (lock) =>
          lock
            ? { acquired: true as const, result: await operation() }
            : { acquired: false as const },
      );
    }

    if (fallbackOwners.has(name)) return { acquired: false };
    fallbackOwners.add(name);
    try {
      return { acquired: true, result: await operation() };
    } finally {
      fallbackOwners.delete(name);
    }
  }
}
