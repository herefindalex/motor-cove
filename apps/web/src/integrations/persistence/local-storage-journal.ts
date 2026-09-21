import {
  journalEntrySchema,
  type JournalEntry,
  type JournalLoadIssue,
  type TransactionJournal,
} from '../../capabilities/transactions/index.js';

const key = (deploymentId: string) => `motorcove:journal:v1:${deploymentId}`;
const lockKey = (deploymentId: string) => `${key(deploymentId)}:write`;
const fallbackQueues = new Map<string, Promise<void>>();

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
  private readonly volatileEntries = new Map<string, JournalEntry>();

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

  load(deploymentId: string): readonly JournalEntry[] {
    const raw = localStorage.getItem(key(deploymentId));
    if (!raw) {
      this.issues.delete(deploymentId);
      return this.withVolatile(deploymentId, []);
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
      return this.withVolatile(deploymentId, []);
    }

    if (!Array.isArray(value)) {
      this.issues.set(deploymentId, [
        { deploymentId, reason: 'INVALID_ENTRY', detail: 'Journal root must be an array.' },
      ]);
      return this.withVolatile(deploymentId, []);
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
    return this.withVolatile(deploymentId, entries);
  }

  loadIssues(deploymentId: string): readonly JournalLoadIssue[] {
    this.load(deploymentId);
    return this.issues.get(deploymentId) ?? [];
  }

  async save(entry: JournalEntry): Promise<void> {
    const parsed = journalEntrySchema.parse(entry);
    if (this.volatileEntries.has(parsed.clientOperationId)) {
      this.volatileEntries.set(parsed.clientOperationId, parsed);
      for (const listener of this.listeners) listener();
      return;
    }
    await withWriteLock(parsed.deploymentId, () => {
      const loaded = this.load(parsed.deploymentId);
      if ((this.issues.get(parsed.deploymentId)?.length ?? 0) > 0) {
        throw new Error('JOURNAL_STORAGE_INVALID');
      }
      const current = loaded.find((item) => item.clientOperationId === parsed.clientOperationId);
      if (current && Date.parse(current.updatedAt) > Date.parse(parsed.updatedAt)) return;
      const entries = loaded.filter(
        (item) =>
          item.clientOperationId !== parsed.clientOperationId &&
          !this.volatileEntries.has(item.clientOperationId),
      );
      localStorage.setItem(key(parsed.deploymentId), JSON.stringify([...entries, parsed]));
    });
    for (const listener of this.listeners) listener();
  }

  saveVolatile(entry: JournalEntry): void {
    const parsed = journalEntrySchema.parse(entry);
    this.volatileEntries.set(parsed.clientOperationId, parsed);
    for (const listener of this.listeners) listener();
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
