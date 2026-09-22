// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resumeJournalEntry,
  submitOperation,
  type JournalEntry,
} from '../../capabilities/transactions/index.js';
import { LocalStorageJournal } from './local-storage-journal.js';

const deploymentId = `0x${'1'.repeat(64)}` as const;
const storageKey = `motorcove:journal:v1:${deploymentId}`;
const entry: JournalEntry = {
  schemaVersion: 1,
  clientOperationId: 'operation-1',
  createdAt: '2026-09-21T00:00:00.000Z',
  updatedAt: '2026-09-21T00:00:00.000Z',
  deploymentId,
  chainId: 31_337,
  account: `0x${'2'.repeat(40)}`,
  protocolVersion: '1',
  action: 'FUND_SALE',
  saleId: '1',
  intendedContract: `0x${'3'.repeat(40)}`,
  intendedCalldata: '0x1234',
  calldataSummary: 'FUND_SALE',
  valueWei: '10',
  status: 'PREPARING',
};

describe('LocalStorageJournal', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('round trips a runtime validated entry', async () => {
    const journal = new LocalStorageJournal();
    await journal.save(entry);
    expect(journal.load(deploymentId)).toEqual([{ ...entry, revision: 1 }]);
    expect(journal.loadIssues(deploymentId)).toEqual([]);
  });

  it('quarantines malformed JSON as a diagnostic', () => {
    localStorage.setItem(storageKey, '{');
    const journal = new LocalStorageJournal();
    expect(journal.load(deploymentId)).toEqual([]);
    expect(journal.loadIssues(deploymentId)[0]?.reason).toBe('CORRUPT_STORAGE');
  });

  it('rejects unknown schema versions and partial entries', async () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify([{ ...entry, schemaVersion: 2 }, { schemaVersion: 1 }]),
    );
    const journal = new LocalStorageJournal();
    expect(journal.load(deploymentId)).toEqual([]);
    expect(journal.loadIssues(deploymentId)).toHaveLength(2);
    await expect(journal.save(entry)).rejects.toThrow('JOURNAL_STORAGE_INVALID');
    expect(JSON.parse(localStorage.getItem(storageKey) ?? '[]')).toHaveLength(2);
  });

  it('propagates storage failure to the submission boundary', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    await expect(new LocalStorageJournal().save(entry)).rejects.toThrow('quota exceeded');
  });

  it('keeps a known-hash submission in memory without claiming durable storage', async () => {
    const journal = new LocalStorageJournal();
    const volatile = {
      ...entry,
      originalTxHash: `0x${'4'.repeat(64)}` as const,
      currentTxHash: `0x${'4'.repeat(64)}` as const,
      status: 'SUBMITTED' as const,
    };
    const volatileStored = journal.saveVolatile(volatile);
    expect(journal.load(deploymentId)).toEqual([{ ...volatile, revision: 1 }]);
    expect(localStorage.getItem(storageKey)).toBeNull();

    await journal.save({
      ...volatileStored,
      status: 'INCLUDED_SUCCESS',
      receiptStatus: 'SUCCESS',
    });
    expect(journal.load(deploymentId)[0]).toMatchObject({
      status: 'INCLUDED_SUCCESS',
      receiptStatus: 'SUCCESS',
    });
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('preserves the durable intent beneath a volatile overlay during unrelated writes', async () => {
    const journal = new LocalStorageJournal();
    const prepared = await journal.save(entry);
    const volatile = journal.saveVolatile({
      ...prepared,
      originalTxHash: `0x${'4'.repeat(64)}`,
      currentTxHash: `0x${'4'.repeat(64)}`,
      status: 'SUBMITTED',
    });
    const second = {
      ...entry,
      clientOperationId: 'operation-b',
      createdAt: '2026-09-21T00:00:02.000Z',
      updatedAt: '2026-09-21T00:00:02.000Z',
    };
    await journal.save(second);

    expect(JSON.parse(localStorage.getItem(storageKey) ?? '[]')).toEqual([
      { ...entry, revision: 1 },
      { ...second, revision: 1 },
    ]);
    expect(journal.load(deploymentId)).toEqual([{ ...second, revision: 1 }, volatile]);
  });

  it('serializes journal writes from independent instances through one deployment lock', async () => {
    const second = {
      ...entry,
      clientOperationId: 'operation-2',
      createdAt: '2026-09-21T00:00:01.000Z',
      updatedAt: '2026-09-21T00:00:01.000Z',
    };
    const firstJournal = new LocalStorageJournal();
    const secondJournal = new LocalStorageJournal();

    await Promise.all([firstJournal.save(entry), secondJournal.save(second)]);

    expect(firstJournal.load(deploymentId)).toEqual([
      { ...entry, revision: 1 },
      { ...second, revision: 1 },
    ]);
  });

  it('does not let an older same-operation write erase newer evidence', async () => {
    const journal = new LocalStorageJournal();
    const newer = {
      ...entry,
      updatedAt: '2026-09-21T00:00:03.000Z',
      status: 'INCLUDED_SUCCESS' as const,
      receiptStatus: 'SUCCESS' as const,
      receiptBlockHash: `0x${'5'.repeat(64)}`,
      receiptBlockNumber: '12',
    };
    await journal.save(newer);
    await expect(journal.save({ ...entry, updatedAt: '2026-09-21T00:00:01.000Z' })).rejects.toThrow(
      'JOURNAL_REVISION_CONFLICT',
    );

    expect(journal.load(deploymentId)).toEqual([{ ...newer, revision: 1 }]);
  });

  it('uses a persisted revision instead of wall time to acknowledge a hash', async () => {
    const journal = new LocalStorageJournal();
    const prepared = await journal.save(entry);
    const awaiting = await journal.save({
      ...prepared,
      updatedAt: '2026-09-21T00:00:02.000Z',
      status: 'AWAITING_WALLET',
    });
    const submitted = await journal.save({
      ...awaiting,
      updatedAt: '2026-09-20T23:59:59.000Z',
      originalTxHash: `0x${'4'.repeat(64)}`,
      currentTxHash: `0x${'4'.repeat(64)}`,
      status: 'SUBMITTED',
    });

    expect(submitted.revision).toBe(3);
    expect(journal.load(deploymentId)[0]).toMatchObject({
      revision: 3,
      status: 'SUBMITTED',
      currentTxHash: `0x${'4'.repeat(64)}`,
    });
  });

  it('persists wallet rejection after recovery advances the durable revision', async () => {
    const journal = new LocalStorageJournal();
    const submit = vi.fn(async () => {
      const awaiting = journal.load(deploymentId)[0];
      if (!awaiting) throw new Error('test awaiting-wallet entry missing');
      await resumeJournalEntry(awaiting, {
        journal,
        chain: {
          inspectTransaction: async () => {
            throw new Error('hashless recovery must not inspect the chain');
          },
        },
        observation: {
          observeFunding: async () => {
            throw new Error('hashless recovery must not inspect projection state');
          },
        },
      });
      throw Object.assign(new Error('user denied'), { code: 4001 });
    });

    await expect(
      submitOperation(
        {
          deploymentId,
          chainId: 31_337,
          account: entry.account as `0x${string}`,
          protocolVersion: '1',
          contextStillCurrent: () => true,
        },
        {
          name: 'FUND_SALE',
          saleId: 1n,
          value: 10n,
          contract: entry.intendedContract as `0x${string}`,
          calldata: entry.intendedCalldata as `0x${string}`,
          simulate: async () => undefined,
          submit,
          readNonce: async () => 1,
        },
        journal,
      ),
    ).resolves.toMatchObject({ kind: 'rejected', durable: true });
    expect(submit).toHaveBeenCalledTimes(1);

    const reloaded = new LocalStorageJournal().load(deploymentId)[0];
    expect(reloaded).toMatchObject({
      status: 'REJECTED',
      walletRequestOutcome: 'REJECTED',
      lastErrorCategory: 'WALLET_REJECTED',
    });
  });
});
