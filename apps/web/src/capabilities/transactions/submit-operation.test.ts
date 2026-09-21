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

function journal(failOnSave?: number) {
  const entries: JournalEntry[] = [];
  let saves = 0;
  const port: TransactionJournal = {
    load: () => entries,
    loadIssues: () => [],
    save: (entry) => {
      saves += 1;
      if (saves === failOnSave) throw new Error('storage unavailable');
      const index = entries.findIndex((item) => item.clientOperationId === entry.clientOperationId);
      if (index === -1) entries.push(entry);
      else entries[index] = entry;
    },
    subscribe: () => () => undefined,
  };
  return { entries, port };
}

function fixture(overrides: Partial<SubmissionAction> = {}) {
  const submit = vi.fn(async () => hash);
  const action: SubmissionAction = {
    name: 'FUND_SALE',
    saleId: 7n,
    value: 10n,
    contract,
    calldata: '0x1234',
    simulate: async () => undefined,
    submit,
    readNonce: async () => 9,
    ...overrides,
  };
  const context: SubmissionContext = {
    deploymentId,
    chainId: 31_337,
    account,
    protocolVersion: '1',
    contextStillCurrent: () => true,
  };
  return { action, context, submit };
}

describe('submitOperation', () => {
  it('does not call the wallet when the durable intent write fails', async () => {
    const store = journal(1);
    const { action, context, submit } = fixture();
    await expect(submitOperation(context, action, store.port)).rejects.toThrow(
      'storage unavailable',
    );
    expect(submit).toHaveBeenCalledTimes(0);
  });

  it('records a failed precondition without calling the wallet', async () => {
    const store = journal();
    const { action, context, submit } = fixture({
      simulate: async () => {
        throw new Error('sale already funded');
      },
    });
    expect(await submitOperation(context, action, store.port)).toEqual({
      kind: 'failed',
      message: 'sale already funded',
    });
    expect(submit).toHaveBeenCalledTimes(0);
    expect(store.entries[0]?.status).toBe('FAILED_BEFORE_SUBMIT');
  });

  it('records an explicit wallet rejection', async () => {
    const store = journal();
    const { action, context } = fixture({
      submit: async () => {
        throw Object.assign(new Error('user denied'), { code: 4001 });
      },
    });
    expect(await submitOperation(context, action, store.port)).toEqual({ kind: 'rejected' });
    expect(store.entries[0]?.status).toBe('REJECTED');
  });

  it('records response loss as unknown and never resubmits', async () => {
    const store = journal();
    const submit = vi.fn(async () => {
      throw new Error('wallet response channel closed');
    });
    const { action, context } = fixture({ submit });
    expect(await submitOperation(context, action, store.port)).toEqual({ kind: 'unknown' });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(store.entries[0]?.status).toBe('UNKNOWN');
  });

  it('returns a copyable hash when the first hash write fails', async () => {
    const store = journal(3);
    const { action, context, submit } = fixture();
    expect(await submitOperation(context, action, store.port)).toEqual({ kind: 'unknown', hash });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('retains a durable hash when nonce lookup fails', async () => {
    const store = journal();
    const { action, context } = fixture({
      readNonce: async () => {
        throw new Error('RPC unavailable');
      },
    });
    expect(await submitOperation(context, action, store.port)).toEqual({ kind: 'submitted', hash });
    expect(store.entries[0]?.currentTxHash).toBe(hash);
    expect(store.entries[0]?.status).toBe('SUBMITTED');
  });

  it('rechecks context after simulation and keeps wallet call count at zero', async () => {
    const store = journal();
    let checks = 0;
    const { action, context, submit } = fixture();
    expect(
      await submitOperation(
        { ...context, contextStillCurrent: () => ++checks === 1 },
        action,
        store.port,
      ),
    ).toMatchObject({ kind: 'failed' });
    expect(submit).toHaveBeenCalledTimes(0);
  });

  it('creates a new operation id for an explicit retry', async () => {
    const store = journal();
    const first = fixture();
    await submitOperation(first.context, first.action, store.port);
    const firstId = store.entries[0]?.clientOperationId;
    expect(firstId).toBeDefined();
    if (!firstId) throw new Error('first operation was not saved');
    const retry = fixture({ retryOf: firstId });
    await submitOperation(retry.context, retry.action, store.port);
    expect(store.entries).toHaveLength(2);
    expect(store.entries[1]?.retryOf).toBe(firstId);
    expect(store.entries[1]?.clientOperationId).not.toBe(firstId);
  });
});
