import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const deploymentId = `0x${'1'.repeat(64)}`;
const storageKey = `motorcove:journal:v1:${deploymentId}`;

const entry = (clientOperationId: string, updatedAt: string) => ({
  schemaVersion: 1 as const,
  clientOperationId,
  createdAt: '2026-09-21T00:00:00.000Z',
  updatedAt,
  deploymentId,
  chainId: 31_337,
  account: `0x${'2'.repeat(40)}`,
  protocolVersion: '1',
  action: 'CREATE_SALE',
  saleId: '1',
  intendedContract: `0x${'3'.repeat(40)}`,
  intendedCalldata: '0x1234',
  calldataSummary: 'CREATE_SALE',
  valueWei: '0',
  status: 'SUBMITTED' as const,
  originalTxHash: `0x${'4'.repeat(64)}`,
  currentTxHash: `0x${'4'.repeat(64)}`,
});

async function save(page: Page, value: ReturnType<typeof entry>) {
  await page.evaluate(async (candidate) => {
    const module = (await eval(
      "import('/src/integrations/persistence/local-storage-journal.ts')",
    )) as {
      LocalStorageJournal: new () => {
        save(entry: unknown): Promise<unknown>;
      };
    };
    await new module.LocalStorageJournal().save(candidate);
  }, value);
}

async function runObservation(page: Page, clientOperationId: string) {
  return page.evaluate(
    async ({ currentDeploymentId, currentOperationId }) => {
      const module = (await eval(
        "import('/src/integrations/persistence/browser-observation-coordinator.ts')",
      )) as {
        BrowserTransactionObservationCoordinator: new () => {
          run<T>(
            identity: { deploymentId: string; clientOperationId: string },
            options: { wait: boolean },
            operation: () => Promise<T>,
          ): Promise<{ acquired: boolean; result?: T }>;
        };
      };
      return new module.BrowserTransactionObservationCoordinator().run(
        { deploymentId: currentDeploymentId, clientOperationId: currentOperationId },
        { wait: false },
        async () => 'completed',
      );
    },
    { currentDeploymentId: deploymentId, currentOperationId: clientOperationId },
  );
}

async function holdObservation(page: Page, clientOperationId: string) {
  await page.evaluate(
    async ({ currentDeploymentId, currentOperationId }) => {
      const module = (await eval(
        "import('/src/integrations/persistence/browser-observation-coordinator.ts')",
      )) as {
        BrowserTransactionObservationCoordinator: new () => {
          run<T>(
            identity: { deploymentId: string; clientOperationId: string },
            options: { wait: boolean },
            operation: () => Promise<T>,
          ): Promise<unknown>;
        };
      };
      const hold = new Promise<void>(() => undefined);
      void new module.BrowserTransactionObservationCoordinator().run(
        { deploymentId: currentDeploymentId, clientOperationId: currentOperationId },
        { wait: false },
        async () => {
          await hold;
          return 'released';
        },
      );
    },
    { currentDeploymentId: deploymentId, currentOperationId: clientOperationId },
  );
}

async function holdSubmission(page: Page) {
  return page.evaluate(
    async ({ currentDeploymentId }) => {
      const [
        { submitOperation },
        { LocalStorageJournal },
        { BrowserTransactionSubmissionCoordinator },
      ] = (await Promise.all([
        eval("import('/src/capabilities/transactions/submit-operation.ts')"),
        eval("import('/src/integrations/persistence/local-storage-journal.ts')"),
        eval("import('/src/integrations/persistence/browser-submission-coordinator.ts')"),
      ])) as [
        {
          submitOperation: (...args: unknown[]) => Promise<unknown>;
        },
        {
          LocalStorageJournal: new () => unknown;
        },
        {
          BrowserTransactionSubmissionCoordinator: new () => unknown;
        },
      ];
      const scope = window as typeof window & {
        releaseSubmission?: () => void;
        submissionSimulationCount?: number;
        submissionWalletCount?: number;
      };
      scope.submissionSimulationCount = 0;
      scope.submissionWalletCount = 0;
      const pending = new Promise<void>((resolve) => {
        scope.releaseSubmission = resolve;
      });
      return submitOperation(
        {
          deploymentId: currentDeploymentId,
          chainId: 31_337,
          account: `0x${'2'.repeat(40)}`,
          protocolVersion: '1',
          contextStillCurrent: () => true,
        },
        {
          name: 'CREATE_SALE',
          saleId: 1n,
          value: 0n,
          contract: `0x${'3'.repeat(40)}`,
          calldata: '0x1234',
          simulate: async () => {
            scope.submissionSimulationCount = (scope.submissionSimulationCount ?? 0) + 1;
            await pending;
          },
          submit: async () => {
            scope.submissionWalletCount = (scope.submissionWalletCount ?? 0) + 1;
            return `0x${'4'.repeat(64)}`;
          },
          readNonce: async () => 7,
        },
        new (LocalStorageJournal as new () => Parameters<typeof submitOperation>[2])(),
        new (BrowserTransactionSubmissionCoordinator as new () => Parameters<
          typeof submitOperation
        >[3])(),
      );
    },
    { currentDeploymentId: deploymentId },
  );
}

async function contendForSubmission(page: Page) {
  return page.evaluate(
    async ({ currentDeploymentId }) => {
      const [
        { submitOperation },
        { LocalStorageJournal },
        { BrowserTransactionSubmissionCoordinator },
      ] = (await Promise.all([
        eval("import('/src/capabilities/transactions/submit-operation.ts')"),
        eval("import('/src/integrations/persistence/local-storage-journal.ts')"),
        eval("import('/src/integrations/persistence/browser-submission-coordinator.ts')"),
      ])) as [
        {
          submitOperation: (...args: unknown[]) => Promise<unknown>;
        },
        {
          LocalStorageJournal: new () => unknown;
        },
        {
          BrowserTransactionSubmissionCoordinator: new () => unknown;
        },
      ];
      const scope = window as typeof window & {
        contenderSimulationCount?: number;
        contenderWalletCount?: number;
      };
      scope.contenderSimulationCount = 0;
      scope.contenderWalletCount = 0;
      try {
        await submitOperation(
          {
            deploymentId: currentDeploymentId,
            chainId: 31_337,
            account: `0x${'2'.repeat(40)}`,
            protocolVersion: '1',
            contextStillCurrent: () => true,
          },
          {
            name: 'CREATE_SALE',
            saleId: 1n,
            value: 0n,
            contract: `0x${'3'.repeat(40)}`,
            calldata: '0x1234',
            simulate: async () => {
              scope.contenderSimulationCount = (scope.contenderSimulationCount ?? 0) + 1;
            },
            submit: async () => {
              scope.contenderWalletCount = (scope.contenderWalletCount ?? 0) + 1;
              return `0x${'5'.repeat(64)}`;
            },
            readNonce: async () => 8,
          },
          new (LocalStorageJournal as new () => Parameters<typeof submitOperation>[2])(),
          new (BrowserTransactionSubmissionCoordinator as new () => Parameters<
            typeof submitOperation
          >[3])(),
        );
        return {
          error: null,
          simulations: scope.contenderSimulationCount,
          wallets: scope.contenderWalletCount,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
          simulations: scope.contenderSimulationCount,
          wallets: scope.contenderWalletCount,
        };
      }
    },
    { currentDeploymentId: deploymentId },
  );
}

async function holdSubmissionOwnership(page: Page, intentKey: string) {
  await page.evaluate(async (key) => {
    const module = (await eval(
      "import('/src/integrations/persistence/browser-submission-coordinator.ts')",
    )) as {
      BrowserTransactionSubmissionCoordinator: new () => {
        run<T>(
          intentKey: string,
          operation: () => Promise<T>,
        ): Promise<{ acquired: boolean; result?: T }>;
      };
    };
    const hold = new Promise<void>(() => undefined);
    void new module.BrowserTransactionSubmissionCoordinator().run(key, async () => {
      await hold;
      return 'released';
    });
  }, intentKey);
}

async function runSubmissionOwnership(page: Page, intentKey: string) {
  return page.evaluate(async (key) => {
    const module = (await eval(
      "import('/src/integrations/persistence/browser-submission-coordinator.ts')",
    )) as {
      BrowserTransactionSubmissionCoordinator: new () => {
        run<T>(
          intentKey: string,
          operation: () => Promise<T>,
        ): Promise<{ acquired: boolean; result?: T }>;
      };
    };
    return new module.BrowserTransactionSubmissionCoordinator().run(key, async () => 'completed');
  }, intentKey);
}

test('keeps different operations written concurrently by two tabs', async ({ browser }) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  const second = await context.newPage();
  await Promise.all([first.goto('/'), second.goto('/')]);
  await first.evaluate(() => localStorage.clear());

  await Promise.all([
    save(first, entry('operation-a', '2026-09-21T00:00:01.000Z')),
    save(second, entry('operation-b', '2026-09-21T00:00:02.000Z')),
  ]);

  const stored = await first.evaluate((key) => {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) throw new Error('journal is not an array');
    return parsed.map((item: unknown) => {
      if (
        typeof item !== 'object' ||
        item === null ||
        !('clientOperationId' in item) ||
        typeof item.clientOperationId !== 'string'
      )
        throw new Error('journal operation is invalid');
      return item.clientOperationId;
    });
  }, storageKey);
  expect(stored.sort()).toEqual(['operation-a', 'operation-b']);
  await context.close();
});

test('preserves newer same-operation evidence and releases lock when a writer tab closes', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const writer = await context.newPage();
  const successor = await context.newPage();
  await Promise.all([writer.goto('/'), successor.goto('/')]);
  await writer.evaluate(() => localStorage.clear());

  const lockName = `motorcove:journal:v1:${deploymentId}:write`;
  const holding = writer
    .evaluate(
      (name) =>
        navigator.locks.request(name, { mode: 'exclusive' }, () => new Promise(() => undefined)),
      lockName,
    )
    .catch(() => undefined);
  await expect
    .poll(() =>
      writer.evaluate(
        (name) =>
          navigator.locks.query().then((state) => state.held.some((lock) => lock.name === name)),
        lockName,
      ),
    )
    .toBe(true);

  const successorSave = save(successor, entry('operation-a', '2026-09-21T00:00:03.000Z'));
  await writer.close();
  await successorSave;
  await holding;
  await expect(save(successor, entry('operation-a', '2026-09-21T00:00:01.000Z'))).rejects.toThrow(
    'JOURNAL_REVISION_CONFLICT',
  );

  const stored = await successor.evaluate((key) => {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) throw new Error('journal is not an array');
    return parsed.map((item: unknown) => {
      if (
        typeof item !== 'object' ||
        item === null ||
        !('clientOperationId' in item) ||
        typeof item.clientOperationId !== 'string' ||
        !('updatedAt' in item) ||
        typeof item.updatedAt !== 'string'
      )
        throw new Error('journal operation is invalid');
      if (!('revision' in item) || typeof item.revision !== 'number') {
        throw new Error('journal revision is invalid');
      }
      return {
        clientOperationId: item.clientOperationId,
        updatedAt: item.updatedAt,
        revision: item.revision,
      };
    });
  }, storageKey);
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({
    clientOperationId: 'operation-a',
    updatedAt: '2026-09-21T00:00:03.000Z',
    revision: 1,
  });
  await context.close();
});

test('coordinates observation ownership across tabs without blocking journal writes', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const owner = await context.newPage();
  const contender = await context.newPage();
  await Promise.all([owner.goto('/'), contender.goto('/')]);
  await owner.evaluate(() => localStorage.clear());

  const operationId = 'observed-operation';
  const lockName = `motorcove:transaction-observation:v1:${deploymentId}:${operationId}`;
  await holdObservation(owner, operationId);
  await expect
    .poll(() =>
      owner.evaluate(
        (name) =>
          navigator.locks.query().then((state) => state.held.some((lock) => lock.name === name)),
        lockName,
      ),
    )
    .toBe(true);

  await expect(runObservation(contender, operationId)).resolves.toEqual({ acquired: false });
  await expect(runObservation(contender, 'different-operation')).resolves.toEqual({
    acquired: true,
    result: 'completed',
  });

  await save(contender, entry('journal-operation', '2026-09-22T00:00:04.000Z'));
  const storedIds = await contender.evaluate((key) => {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{
      clientOperationId: string;
    }>;
    return parsed.map((item) => item.clientOperationId);
  }, storageKey);
  expect(storedIds).toContain('journal-operation');

  await owner.close();
  await expect
    .poll(() => runObservation(contender, operationId))
    .toEqual({
      acquired: true,
      result: 'completed',
    });
  await context.close();
});

test('coordinates same-intent submission ownership across tabs before wallet work', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const owner = await context.newPage();
  const contender = await context.newPage();
  await Promise.all([owner.goto('/'), contender.goto('/')]);
  await owner.evaluate(() => localStorage.clear());

  const ownerSubmission = holdSubmission(owner);
  await expect
    .poll(() =>
      owner.evaluate(() =>
        navigator.locks
          .query()
          .then((state) =>
            state.held.some((lock) =>
              lock.name?.startsWith('motorcove:transaction-submission:v1:'),
            ),
          ),
      ),
    )
    .toBe(true);

  await expect(contendForSubmission(contender)).resolves.toEqual({
    error: 'OPERATION_ALREADY_IN_FLIGHT',
    simulations: 0,
    wallets: 0,
  });
  const beforeRelease = await contender.evaluate((key) => {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{
      status: string;
    }>;
    return parsed.map((item) => item.status);
  }, storageKey);
  expect(beforeRelease).toEqual(['PREPARING']);

  await owner.evaluate(() => {
    const scope = window as typeof window & { releaseSubmission?: () => void };
    scope.releaseSubmission?.();
  });
  await expect(ownerSubmission).resolves.toMatchObject({ kind: 'submitted' });
  await expect(
    owner.evaluate(() => ({
      simulations: (window as typeof window & { submissionSimulationCount?: number })
        .submissionSimulationCount,
      wallets: (window as typeof window & { submissionWalletCount?: number }).submissionWalletCount,
    })),
  ).resolves.toEqual({ simulations: 1, wallets: 1 });

  await holdSubmissionOwnership(owner, 'owner-close');
  await expect
    .poll(() =>
      owner.evaluate(() =>
        navigator.locks
          .query()
          .then((state) =>
            state.held.some(
              (lock) => lock.name === 'motorcove:transaction-submission:v1:owner-close',
            ),
          ),
      ),
    )
    .toBe(true);
  await expect(runSubmissionOwnership(contender, 'different-intent')).resolves.toEqual({
    acquired: true,
    result: 'completed',
  });
  await expect(runSubmissionOwnership(contender, 'owner-close')).resolves.toEqual({
    acquired: false,
  });
  await owner.close();
  await expect
    .poll(() => runSubmissionOwnership(contender, 'owner-close'))
    .toEqual({
      acquired: true,
      result: 'completed',
    });
  await context.close();
});
