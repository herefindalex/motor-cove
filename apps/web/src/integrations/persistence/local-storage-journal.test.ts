// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import {
  resumeJournalEntry,
  submitOperation,
  type JournalEntry,
  useJournalEntries,
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
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

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

  it('keeps volatile evidence readable and reports unavailable storage without throwing', () => {
    const journal = new LocalStorageJournal();
    const volatile = journal.saveVolatile({
      ...entry,
      originalTxHash: `0x${'4'.repeat(64)}`,
      currentTxHash: `0x${'4'.repeat(64)}`,
      status: 'SUBMITTED',
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('storage denied by browser policy', 'SecurityError');
    });

    expect(journal.load(deploymentId)).toEqual([volatile]);
    expect(journal.loadIssues(deploymentId)).toEqual([
      expect.objectContaining({ deploymentId, reason: 'STORAGE_UNAVAILABLE' }),
    ]);
    expect(() => renderHook(() => useJournalEntries(journal, deploymentId))).not.toThrow();
  });

  it('keeps a one-shot read failure visible in the same snapshot and classifies blocked writes', async () => {
    const journal = new LocalStorageJournal();
    let reads = 0;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      reads += 1;
      if (reads === 1) throw new DOMException('transient storage denial', 'SecurityError');
      return null;
    });

    expect(journal.load(deploymentId)).toEqual([]);
    expect(journal.loadIssues(deploymentId)).toEqual([
      expect.objectContaining({ reason: 'STORAGE_UNAVAILABLE' }),
    ]);
    expect(reads).toBe(1);

    reads = 0;
    await expect(journal.save(entry)).rejects.toThrow('JOURNAL_STORAGE_UNAVAILABLE');
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

  it('continues read-only verification in volatile state when durable writes fail', async () => {
    const journal = new LocalStorageJournal();
    const transactionHash = `0x${'4'.repeat(64)}` as const;
    const submitted = await journal.save({
      ...entry,
      action: 'APPROVE_TOKEN',
      tokenId: '1',
      saleId: undefined,
      status: 'SUBMITTED',
      originalTxHash: transactionHash,
      currentTxHash: transactionHash,
    });
    const durableBefore = localStorage.getItem(storageKey);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    const inspectTransaction = vi.fn(async () => ({
      kind: 'INCLUDED_SUCCESS' as const,
      transactionHash,
      blockNumber: 8n,
      blockHash: `0x${'5'.repeat(64)}` as const,
    }));
    const ports = {
      chain: { inspectTransaction },
      observation: { observeFunding: vi.fn() },
      journal,
    };

    await expect(resumeJournalEntry(submitted, ports)).resolves.toEqual({ kind: 'INCLUDED' });

    expect(inspectTransaction).toHaveBeenCalledTimes(1);
    expect(journal.load(deploymentId)[0]).toMatchObject({
      status: 'INCLUDED_SUCCESS',
      receiptStatus: 'SUCCESS',
      currentTxHash: transactionHash,
    });
    expect(journal.loadIssues(deploymentId)).toEqual([
      expect.objectContaining({ reason: 'STORAGE_UNAVAILABLE' }),
    ]);
    expect(localStorage.getItem(storageKey)).toBe(durableBefore);

    setItem.mockRestore();
    await journal.save({
      ...entry,
      clientOperationId: 'unrelated-operation',
      createdAt: '2026-09-21T00:00:03.000Z',
      updatedAt: '2026-09-21T00:00:03.000Z',
    });
    expect(journal.loadIssues(deploymentId)).toEqual([
      expect.objectContaining({ reason: 'STORAGE_UNAVAILABLE' }),
    ]);

    const volatile = journal
      .load(deploymentId)
      .find((candidate) => candidate.clientOperationId === submitted.clientOperationId)!;
    await expect(resumeJournalEntry(volatile, ports)).resolves.toEqual({ kind: 'INCLUDED' });
    expect(journal.loadIssues(deploymentId)).toEqual([]);
    expect(
      new LocalStorageJournal()
        .load(deploymentId)
        .find((candidate) => candidate.clientOperationId === submitted.clientOperationId),
    ).toMatchObject({
      status: 'INCLUDED_SUCCESS',
      currentTxHash: transactionHash,
    });
  });

  it('rebases a volatile returned hash over a concurrent hashless durable revision', async () => {
    const first = new LocalStorageJournal();
    const second = new LocalStorageJournal();
    const prepared = await first.save(entry);
    const awaiting = await first.save({
      ...prepared,
      updatedAt: '2026-09-21T00:00:01.000Z',
      walletRequestStartedAt: '2026-09-21T00:00:01.000Z',
      status: 'AWAITING_WALLET',
    });
    const transactionHash = `0x${'4'.repeat(64)}` as const;
    const volatile = first.saveVolatile({
      ...awaiting,
      updatedAt: '2026-09-21T00:00:02.000Z',
      originalTxHash: transactionHash,
      currentTxHash: transactionHash,
      evidenceSource: 'WALLET_RETURNED',
      association: 'EXACT_SUBMISSION',
      status: 'SUBMITTED',
    });
    const durableAwaiting = second.load(deploymentId)[0];
    if (!durableAwaiting) throw new Error('durable awaiting-wallet entry missing');
    await second.save({
      ...durableAwaiting,
      updatedAt: '2026-09-21T00:00:03.000Z',
      status: 'UNKNOWN',
      lastErrorCategory: 'HASH_REQUIRED_FROM_WALLET_ACTIVITY',
    });

    await expect(first.retryDurableSave(volatile)).resolves.toMatchObject({
      revision: 4,
      status: 'SUBMITTED',
      currentTxHash: transactionHash,
    });
    const reloaded = new LocalStorageJournal().load(deploymentId)[0];
    expect(reloaded).toMatchObject({
      revision: 4,
      status: 'SUBMITTED',
      currentTxHash: transactionHash,
    });
    expect(reloaded).not.toHaveProperty('lastErrorCategory');
  });

  it('does not overwrite conflicting durable transaction evidence during volatile retry', async () => {
    const first = new LocalStorageJournal();
    const second = new LocalStorageJournal();
    const prepared = await first.save(entry);
    const awaiting = await first.save({
      ...prepared,
      updatedAt: '2026-09-21T00:00:01.000Z',
      walletRequestStartedAt: '2026-09-21T00:00:01.000Z',
      status: 'AWAITING_WALLET',
    });
    const volatileHash = `0x${'4'.repeat(64)}` as const;
    const durableHash = `0x${'6'.repeat(64)}` as const;
    const volatile = first.saveVolatile({
      ...awaiting,
      updatedAt: '2026-09-21T00:00:02.000Z',
      originalTxHash: volatileHash,
      currentTxHash: volatileHash,
      evidenceSource: 'WALLET_RETURNED',
      association: 'EXACT_SUBMISSION',
      status: 'SUBMITTED',
    });
    const durableAwaiting = second.load(deploymentId)[0];
    if (!durableAwaiting) throw new Error('durable awaiting-wallet entry missing');
    await second.save({
      ...durableAwaiting,
      updatedAt: '2026-09-21T00:00:03.000Z',
      originalTxHash: durableHash,
      currentTxHash: durableHash,
      evidenceSource: 'USER_SUPPLIED',
      association: 'INTENT_MATCH',
      status: 'SUBMITTED',
    });

    await expect(first.retryDurableSave(volatile)).rejects.toThrow('JOURNAL_REVISION_CONFLICT');
    expect(first.load(deploymentId)[0]?.currentTxHash).toBe(volatileHash);
    expect(new LocalStorageJournal().load(deploymentId)[0]?.currentTxHash).toBe(durableHash);
  });
});
