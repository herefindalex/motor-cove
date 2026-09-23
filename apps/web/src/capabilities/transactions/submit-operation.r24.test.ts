import { describe, expect, it, vi } from 'vitest';
import type { JournalEntry } from './model.js';
import type { TransactionJournal } from './ports.js';
import {
  submitOperation,
  type SubmissionAction,
  type SubmissionContext,
} from './submit-operation.js';

const deploymentId = `0x${'1'.repeat(64)}` as const;
const account = `0x${'2'.repeat(40)}` as const;
const contract = `0x${'3'.repeat(40)}` as const;
const hash = `0x${'4'.repeat(64)}` as const;

function journal() {
  const entries: JournalEntry[] = [];
  const statuses: string[] = [];
  const port: TransactionJournal = {
    load: () => entries,
    loadIssues: () => [],
    save: async (entry) => {
      statuses.push(entry.status);
      const index = entries.findIndex(
        (candidate) => candidate.clientOperationId === entry.clientOperationId,
      );
      const stored = { ...entry, revision: (entry.revision ?? 0) + 1 };
      if (index === -1) entries.push(stored);
      else entries[index] = stored;
      return stored;
    },
    saveVolatile: (entry) => entry,
    subscribe: () => () => undefined,
  };
  return { entries, statuses, port };
}

describe('R24 late submission environment verification', () => {
  it('rechecks live context after the provider proof resolves', async () => {
    const storage = journal();
    let current = true;
    const submit = vi.fn(async () => hash);
    const context: SubmissionContext = {
      deploymentId,
      chainId: 31_337,
      account,
      protocolVersion: '0.1.0',
      contextStillCurrent: () => current,
    };

    const result = await submitOperation(
      context,
      {
        name: 'FUND_SALE',
        saleId: 7n,
        value: 10n,
        contract,
        calldata: '0x1234',
        simulate: async () => undefined,
        verifyBeforeSubmit: async () => {
          current = false;
        },
        submit,
        readNonce: async () => 9,
      },
      storage.port,
    );

    expect(result).toMatchObject({ kind: 'failed', message: 'OPERATION_CONTEXT_CHANGED' });
    expect(submit).not.toHaveBeenCalled();
    expect(storage.entries.at(-1)).toMatchObject({
      status: 'FAILED_BEFORE_SUBMIT',
      lastErrorCategory: 'OPERATION_CONTEXT_CHANGED',
    });
  });

  it('fails after durable AWAITING_WALLET but before opening the wallet', async () => {
    const storage = journal();
    const submit = vi.fn(async () => hash);
    const verifyBeforeSubmit = vi.fn(async () => {
      throw new Error('OPERATION_ENVIRONMENT_MISMATCH');
    });
    const context: SubmissionContext = {
      deploymentId,
      chainId: 31_337,
      account,
      protocolVersion: '0.1.0',
      contextStillCurrent: () => true,
    };

    const action = {
      name: 'FUND_SALE',
      saleId: 7n,
      value: 10n,
      contract,
      calldata: '0x1234',
      simulate: vi.fn(async () => undefined),
      verifyBeforeSubmit,
      submit,
      readNonce: vi.fn(async () => 9),
    } as SubmissionAction & {
      readonly verifyBeforeSubmit: () => Promise<void>;
    };

    await expect(submitOperation(context, action, storage.port)).resolves.toMatchObject({
      kind: 'failed',
      message: 'OPERATION_ENVIRONMENT_MISMATCH',
    });

    expect(action.simulate).toHaveBeenCalledOnce();
    expect(verifyBeforeSubmit).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
    expect(storage.statuses).toEqual(
      expect.arrayContaining(['PREPARING', 'AWAITING_WALLET', 'FAILED_BEFORE_SUBMIT']),
    );
    expect(storage.entries.at(-1)).toMatchObject({
      status: 'FAILED_BEFORE_SUBMIT',
      lastErrorCategory: 'OPERATION_ENVIRONMENT_MISMATCH',
    });
  });
});
