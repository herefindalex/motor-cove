import {
  journalEntrySchema,
  type JournalEntry,
  type JournalLoadIssue,
  type TransactionJournal,
} from '../../capabilities/transactions/index.js';

const key = (deploymentId: string) => `motorcove:journal:v1:${deploymentId}`;
const lockKey = (deploymentId: string) => `${key(deploymentId)}:write`;
const fallbackQueues = new Map<string, Promise<void>>();

function sameOperationIntent(left: JournalEntry, right: JournalEntry): boolean {
  return (
    left.clientOperationId === right.clientOperationId &&
    left.deploymentId === right.deploymentId &&
    left.chainId === right.chainId &&
    left.account.toLowerCase() === right.account.toLowerCase() &&
    left.protocolVersion === right.protocolVersion &&
    left.action === right.action &&
    left.saleId === right.saleId &&
    left.tokenId === right.tokenId &&
    left.intendedContract.toLowerCase() === right.intendedContract.toLowerCase() &&
    left.intendedCalldata.toLowerCase() === right.intendedCalldata.toLowerCase() &&
    left.valueWei === right.valueWei &&
    left.walletRequestStartedAt === right.walletRequestStartedAt
  );
}

function hasTransactionEvidence(entry: JournalEntry): boolean {
  return (
    Boolean(
      entry.currentTxHash ??
      entry.originalTxHash ??
      entry.receiptStatus ??
      entry.receiptBlockHash ??
      entry.association ??
      entry.projectionTransactionHash,
    ) || entry.eventLogIndex !== undefined
  );
}

function rebaseUniqueVolatileEvidence(
  durable: JournalEntry | undefined,
  volatile: JournalEntry,
): JournalEntry | undefined {
  if (
    !durable ||
    !sameOperationIntent(durable, volatile) ||
    hasTransactionEvidence(durable) ||
    !hasTransactionEvidence(volatile)
  ) {
    return undefined;
  }

  return {
    ...durable,
    ...volatile,
    revision: durable.revision,
    verificationRequestId: volatile.verificationRequestId,
    verificationAvailability: volatile.verificationAvailability,
    lastErrorCategory: volatile.lastErrorCategory,
  };
}

async function withWriteLock<T>(deploymentId: string, operation: () => T | Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(lockKey(deploymentId), { mode: 'exclusive' }, operation);
  }
  const name = lockKey(deploymentId);
  const previous = fallbackQueues.get(name) ?? Promise.resolve();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => pending);
  fallbackQueues.set(name, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (fallbackQueues.get(name) === tail) fallbackQueues.delete(name);
  }
}

export class LocalStorageJournal implements TransactionJournal {
  private readonly listeners = new Set<() => void>();
  private readonly issues = new Map<string, JournalLoadIssue[]>();
  private readonly writeIssues = new Map<string, JournalLoadIssue>();
  private readonly volatileEntries = new Map<string, JournalEntry>();
  private readonly volatileBaseRevisions = new Map<string, number>();

  private withVolatile(
    deploymentId: string,
    durable: readonly JournalEntry[],
  ): readonly JournalEntry[] {
    const volatile = [...this.volatileEntries.values()].filter(
      (entry) => entry.deploymentId === deploymentId,
    );
    const volatileIds = new Set(volatile.map((entry) => entry.clientOperationId));
    return [...durable.filter((entry) => !volatileIds.has(entry.clientOperationId)), ...volatile];
  }

  private loadDurable(deploymentId: string): readonly JournalEntry[] {
    let raw: string | null;
    try {
      raw = localStorage.getItem(key(deploymentId));
    } catch (error) {
      this.issues.set(deploymentId, [
        {
          deploymentId,
          reason: 'STORAGE_UNAVAILABLE',
          detail: error instanceof Error ? error.message : String(error),
        },
      ]);
      return [];
    }
    if (!raw) {
      this.issues.delete(deploymentId);
      return [];
    }

    let value: unknown;
    try {
      value = JSON.parse(raw) as unknown;
    } catch (error) {
      this.issues.set(deploymentId, [
        {
          deploymentId,
          reason: 'CORRUPT_STORAGE',
          detail: error instanceof Error ? error.message : String(error),
        },
      ]);
      return [];
    }

    if (!Array.isArray(value)) {
      this.issues.set(deploymentId, [
        { deploymentId, reason: 'INVALID_ENTRY', detail: 'Journal root must be an array.' },
      ]);
      return [];
    }

    const entries: JournalEntry[] = [];
    const issues: JournalLoadIssue[] = [];
    for (const [index, candidate] of value.entries()) {
      const parsed = journalEntrySchema.safeParse(candidate);
      if (parsed.success) {
        entries.push(parsed.data);
      } else {
        issues.push({
          deploymentId,
          reason: 'INVALID_ENTRY',
          detail: `Entry ${index}: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
        });
      }
    }
    if (issues.length === 0) this.issues.delete(deploymentId);
    else this.issues.set(deploymentId, issues);
    return entries;
  }

  load(deploymentId: string): readonly JournalEntry[] {
    return this.withVolatile(deploymentId, this.loadDurable(deploymentId));
  }

  loadIssues(deploymentId: string): readonly JournalLoadIssue[] {
    const readIssues = this.issues.get(deploymentId) ?? [];
    const writeIssues = [...this.writeIssues.values()].filter(
      (issue) => issue.deploymentId === deploymentId,
    );
    return [...readIssues, ...writeIssues];
  }

  private storageWriteError(entry: JournalEntry, error: unknown): Error {
    const detail = error instanceof Error ? error.message : String(error);
    this.writeIssues.set(entry.clientOperationId, {
      deploymentId: entry.deploymentId,
      reason: 'STORAGE_UNAVAILABLE',
      detail,
    });
    return new Error(`JOURNAL_STORAGE_UNAVAILABLE: ${detail}`);
  }

  async save(entry: JournalEntry): Promise<JournalEntry> {
    const parsed = journalEntrySchema.parse(entry);
    const volatile = this.volatileEntries.get(parsed.clientOperationId);
    if (volatile) {
      if ((parsed.revision ?? 0) !== (volatile.revision ?? 0))
        throw new Error('JOURNAL_REVISION_CONFLICT');
      const stored = { ...parsed, revision: (parsed.revision ?? 0) + 1 };
      this.volatileEntries.set(parsed.clientOperationId, stored);
      for (const listener of this.listeners) listener();
      return stored;
    }

    let stored: JournalEntry;
    try {
      stored = await withWriteLock(parsed.deploymentId, () => {
        const loaded = this.loadDurable(parsed.deploymentId);
        const issues = this.issues.get(parsed.deploymentId) ?? [];
        if (issues.some((issue) => issue.reason === 'STORAGE_UNAVAILABLE')) {
          throw new Error('JOURNAL_STORAGE_UNAVAILABLE');
        }
        if (issues.length > 0) throw new Error('JOURNAL_STORAGE_INVALID');

        const current = loaded.find((item) => item.clientOperationId === parsed.clientOperationId);
        const expectedRevision = parsed.revision ?? 0;
        if ((current?.revision ?? 0) !== expectedRevision)
          throw new Error('JOURNAL_REVISION_CONFLICT');

        const persisted = { ...parsed, revision: expectedRevision + 1 };
        const entries = loaded.filter(
          (item) => item.clientOperationId !== parsed.clientOperationId,
        );
        localStorage.setItem(key(parsed.deploymentId), JSON.stringify([...entries, persisted]));
        return persisted;
      });
    } catch (error) {
      if (
        error instanceof Error &&
        ['JOURNAL_REVISION_CONFLICT', 'JOURNAL_STORAGE_INVALID'].includes(error.message)
      ) {
        throw error;
      }
      throw this.storageWriteError(parsed, error);
    }

    this.writeIssues.delete(parsed.clientOperationId);
    for (const listener of this.listeners) listener();
    return stored;
  }

  async retryDurableSave(entry: JournalEntry): Promise<JournalEntry> {
    const parsed = journalEntrySchema.parse(entry);
    const volatile = this.volatileEntries.get(parsed.clientOperationId);
    if (!volatile) return this.save(parsed);
    if ((parsed.revision ?? 0) !== (volatile.revision ?? 0))
      throw new Error('JOURNAL_REVISION_CONFLICT');

    let stored: JournalEntry;
    try {
      stored = await withWriteLock(parsed.deploymentId, () => {
        const loaded = this.loadDurable(parsed.deploymentId);
        const issues = this.issues.get(parsed.deploymentId) ?? [];
        if (issues.some((issue) => issue.reason === 'STORAGE_UNAVAILABLE')) {
          throw new Error('JOURNAL_STORAGE_UNAVAILABLE');
        }
        if (issues.length > 0) throw new Error('JOURNAL_STORAGE_INVALID');

        const current = loaded.find((item) => item.clientOperationId === parsed.clientOperationId);
        const baseRevision = this.volatileBaseRevisions.get(parsed.clientOperationId) ?? 0;
        const currentRevision = current?.revision ?? 0;
        const candidate =
          currentRevision === baseRevision ? parsed : rebaseUniqueVolatileEvidence(current, parsed);
        if (!candidate) throw new Error('JOURNAL_REVISION_CONFLICT');

        const persisted = { ...candidate, revision: currentRevision + 1 };
        const entries = loaded.filter(
          (item) => item.clientOperationId !== parsed.clientOperationId,
        );
        localStorage.setItem(key(parsed.deploymentId), JSON.stringify([...entries, persisted]));
        return persisted;
      });
    } catch (error) {
      if (
        error instanceof Error &&
        ['JOURNAL_REVISION_CONFLICT', 'JOURNAL_STORAGE_INVALID'].includes(error.message)
      ) {
        throw error;
      }
      throw this.storageWriteError(parsed, error);
    }

    this.volatileEntries.delete(parsed.clientOperationId);
    this.volatileBaseRevisions.delete(parsed.clientOperationId);
    this.writeIssues.delete(parsed.clientOperationId);
    for (const listener of this.listeners) listener();
    return stored;
  }

  saveVolatile(entry: JournalEntry): JournalEntry {
    const parsed = journalEntrySchema.parse(entry);
    if (!this.volatileBaseRevisions.has(parsed.clientOperationId)) {
      this.volatileBaseRevisions.set(parsed.clientOperationId, parsed.revision ?? 0);
    }
    const stored = { ...parsed, revision: (parsed.revision ?? 0) + 1 };
    this.volatileEntries.set(parsed.clientOperationId, stored);
    for (const listener of this.listeners) listener();
    return stored;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key?.startsWith('motorcove:journal:v1:')) listener();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      this.listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  }
}
