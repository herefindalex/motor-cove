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
      return entry;
    },
    saveVolatile: (entry) => {
      const index = entries.findIndex((item) => item.clientOperationId === entry.clientOperationId);
      if (index === -1) entries.push(entry);
      else entries[index] = entry;
      return entry;
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

  it('awaits an asynchronous durable intent failure before opening the wallet', async () => {
    const store = journal();
    const { action, context, submit } = fixture();
    store.port.save = vi.fn(async () => {
      await Promise.resolve();
      throw new Error('async storage unavailable');
    });

    await expect(submitOperation(context, action, store.port)).rejects.toThrow(
      'async storage unavailable',
    );
    expect(submit).not.toHaveBeenCalled();
  });

  it('records a failed precondition without calling the wallet', async () => {
    const store = journal();
    const { action, context, submit } = fixture({
      simulate: async () => {
        throw new Error('sale already funded');
      },
    });
    expect(await submitOperation(context, action, store.port)).toMatchObject({
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
    expect(await submitOperation(context, action, store.port)).toMatchObject({
      kind: 'rejected',
      durable: true,
    });
    expect(store.entries[0]).toMatchObject({
      status: 'REJECTED',
      walletRequestOutcome: 'REJECTED',
    });
  });

  it('merges a wallet rejection after hashless observation advances the revision', async () => {
    const store = journal();
    const originalSave = store.port.save.bind(store.port);
    let outcomeWrites = 0;
    store.port.save = async (entry) => {
      if (entry.walletRequestOutcome === 'REJECTED' && outcomeWrites++ === 0) {
        const current = store.entries[0];
        if (!current) throw new Error('missing current entry');
        store.entries[0] = {
          ...current,
          revision: (current.revision ?? 0) + 1,
          status: 'UNKNOWN',
          lastErrorCategory: 'HASH_REQUIRED_FROM_WALLET_ACTIVITY',
        };
        throw new Error('JOURNAL_REVISION_CONFLICT');
      }
      return originalSave(entry);
    };
    const { action, context } = fixture({
      submit: async () => {
        throw Object.assign(new Error('user denied'), { code: 4001 });
      },
    });

    await expect(submitOperation(context, action, store.port)).resolves.toMatchObject({
      kind: 'rejected',
      durable: true,
    });
    expect(store.entries[0]).toMatchObject({
      status: 'REJECTED',
      walletRequestOutcome: 'REJECTED',
      lastErrorCategory: 'WALLET_REJECTED',
    });
  });

  it('records rejection outcome without erasing transaction evidence found concurrently', async () => {
    const store = journal();
    const originalSave = store.port.save.bind(store.port);
    let outcomeWrites = 0;
    store.port.save = async (entry) => {
      if (entry.walletRequestOutcome === 'REJECTED' && outcomeWrites++ === 0) {
        const current = store.entries[0];
        if (!current) throw new Error('missing current entry');
        store.entries[0] = {
          ...current,
          revision: (current.revision ?? 0) + 1,
          status: 'SUBMITTED',
          originalTxHash: hash,
          currentTxHash: hash,
          evidenceSource: 'USER_SUPPLIED',
          association: 'INTENT_MATCH',
        };
        throw new Error('JOURNAL_REVISION_CONFLICT');
      }
      return originalSave(entry);
    };
    const { action, context } = fixture({
      submit: async () => {
        throw Object.assign(new Error('user denied'), { code: 4001 });
      },
    });

    await expect(submitOperation(context, action, store.port)).resolves.toMatchObject({
      kind: 'rejected',
      durable: true,
    });
    expect(store.entries[0]).toMatchObject({
      status: 'SUBMITTED',
      currentTxHash: hash,
      walletRequestOutcome: 'REJECTED',
    });
  });

  it('marks wallet rejection non-durable when journal storage is unavailable', async () => {
    const store = journal(3);
    const { action, context } = fixture({
      submit: async () => {
        throw Object.assign(new Error('user denied'), { code: 4001 });
      },
    });

    await expect(submitOperation(context, action, store.port)).resolves.toMatchObject({
      kind: 'rejected',
      durable: false,
    });
    expect(store.entries[0]).toMatchObject({
      status: 'REJECTED',
      walletRequestOutcome: 'REJECTED',
    });
  });

  it('records response loss as unknown and never resubmits', async () => {
    const store = journal();
    const submit = vi.fn(async () => {
      throw new Error('wallet response channel closed');
    });
    const { action, context } = fixture({ submit });
    expect(await submitOperation(context, action, store.port)).toMatchObject({
      kind: 'unknown',
      durable: true,
    });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(store.entries[0]?.status).toBe('UNKNOWN');
  });

  it('returns a copyable hash when the first hash write fails', async () => {
    const store = journal(3);
    const { action, context, submit } = fixture();
    const result = await submitOperation(context, action, store.port);
    expect(result).toMatchObject({
      kind: 'submitted-non-durable',
      hash,
    });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(store.entries[0]).toMatchObject({
      clientOperationId: result.clientOperationId,
      currentTxHash: hash,
      status: 'SUBMITTED',
    });
  });

  it('merges a returned hash into the latest hashless journal revision', async () => {
    const store = journal();
    const originalSave = store.port.save.bind(store.port);
    let submittedWrites = 0;
    store.port.save = async (entry) => {
      if (entry.status === 'SUBMITTED' && entry.currentTxHash) {
        submittedWrites += 1;
        if (submittedWrites === 1) {
          const current = store.entries.find(
            (candidate) => candidate.clientOperationId === entry.clientOperationId,
          );
          if (!current) throw new Error('test journal entry missing');
          store.entries[store.entries.indexOf(current)] = {
            ...current,
            revision: (current.revision ?? 0) + 1,
            status: 'UNKNOWN',
            verificationAvailability: 'AVAILABLE',
            lastErrorCategory: 'HASH_REQUIRED_FROM_WALLET_ACTIVITY',
          };
          throw new Error('JOURNAL_REVISION_CONFLICT');
        }
      }
      return originalSave(entry);
    };

    const { action, context, submit } = fixture();
    await expect(submitOperation(context, action, store.port)).resolves.toMatchObject({
      kind: 'submitted',
      hash,
    });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(store.entries[0]).toMatchObject({
      currentTxHash: hash,
      status: 'SUBMITTED',
    });
    expect(store.entries[0]?.lastErrorCategory).toBeUndefined();
  });

  it('retains a durable hash when nonce lookup fails', async () => {
    const store = journal();
    const { action, context } = fixture({
      readNonce: async () => {
        throw new Error('RPC unavailable');
      },
    });
    expect(await submitOperation(context, action, store.port)).toMatchObject({
      kind: 'submitted',
      hash,
    });
    expect(store.entries[0]?.currentTxHash).toBe(hash);
    expect(store.entries[0]?.status).toBe('SUBMITTED');
  });

  it('adds a slow nonce result to the latest journal evidence without regressing status', async () => {
    const store = journal();
    let resolveNonce: ((nonce: number) => void) | undefined;
    const nonce = new Promise<number>((resolve) => {
      resolveNonce = resolve;
    });
    const { action, context } = fixture({ readNonce: async () => nonce });

    const submission = submitOperation(context, action, store.port);
    await vi.waitFor(() => expect(store.entries[0]?.status).toBe('SUBMITTED'));
    const submitted = store.entries[0];
    if (!submitted) throw new Error('submitted entry was not saved');
    await store.port.save({
      ...submitted,
      updatedAt: new Date().toISOString(),
      status: 'INCLUDED_SUCCESS',
      receiptStatus: 'SUCCESS',
      receiptBlockNumber: '105',
      receiptBlockHash: `0x${'5'.repeat(64)}`,
      projectionObservation: 'REFLECTED',
    });

    resolveNonce?.(9);
    await expect(submission).resolves.toMatchObject({ kind: 'submitted', hash });
    expect(store.entries[0]).toMatchObject({
      status: 'INCLUDED_SUCCESS',
      receiptStatus: 'SUCCESS',
      projectionObservation: 'REFLECTED',
      nonce: 9,
    });
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

  it('rechecks context after the awaiting-wallet write finishes', async () => {
    const store = journal();
    const originalSave = store.port.save.bind(store.port);
    let releaseAwaitingWrite!: () => void;
    const awaitingWrite = new Promise<void>((resolve) => {
      releaseAwaitingWrite = resolve;
    });
    let saves = 0;
    store.port.save = async (entry) => {
      saves += 1;
      if (saves === 2) await awaitingWrite;
      return originalSave(entry);
    };
    let current = true;
    const { action, context, submit } = fixture();
    const submission = submitOperation(
      { ...context, contextStillCurrent: () => current },
      action,
      store.port,
    );

    await vi.waitFor(() => expect(saves).toBe(2));
    current = false;
    releaseAwaitingWrite();

    await expect(submission).resolves.toMatchObject({
      kind: 'failed',
      message: 'OPERATION_CONTEXT_CHANGED',
    });
    expect(submit).not.toHaveBeenCalled();
    expect(store.entries[0]).toMatchObject({
      status: 'FAILED_BEFORE_SUBMIT',
      lastErrorCategory: 'OPERATION_CONTEXT_CHANGED',
    });
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
