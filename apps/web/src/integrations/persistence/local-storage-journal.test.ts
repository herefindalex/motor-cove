// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JournalEntry } from '../../capabilities/transactions/index.js';
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

  it('round trips a runtime validated entry', () => {
    const journal = new LocalStorageJournal();
    journal.save(entry);
    expect(journal.load(deploymentId)).toEqual([entry]);
    expect(journal.loadIssues(deploymentId)).toEqual([]);
  });

  it('quarantines malformed JSON as a diagnostic', () => {
    localStorage.setItem(storageKey, '{');
    const journal = new LocalStorageJournal();
    expect(journal.load(deploymentId)).toEqual([]);
    expect(journal.loadIssues(deploymentId)[0]?.reason).toBe('CORRUPT_STORAGE');
  });

  it('rejects unknown schema versions and partial entries', () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify([{ ...entry, schemaVersion: 2 }, { schemaVersion: 1 }]),
    );
    const journal = new LocalStorageJournal();
    expect(journal.load(deploymentId)).toEqual([]);
    expect(journal.loadIssues(deploymentId)).toHaveLength(2);
    expect(() => journal.save(entry)).toThrow('JOURNAL_STORAGE_INVALID');
    expect(JSON.parse(localStorage.getItem(storageKey) ?? '[]')).toHaveLength(2);
  });

  it('propagates storage failure to the submission boundary', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => new LocalStorageJournal().save(entry)).toThrow('quota exceeded');
  });
});
