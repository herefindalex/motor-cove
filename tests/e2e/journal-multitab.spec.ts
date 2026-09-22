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
