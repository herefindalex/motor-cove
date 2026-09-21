import {
  journalEntrySchema,
  type JournalEntry,
  type JournalLoadIssue,
  type TransactionJournal,
} from '../../capabilities/transactions/index.js';

const key = (deploymentId: string) => `motorcove:journal:v1:${deploymentId}`;

export class LocalStorageJournal implements TransactionJournal {
  private readonly listeners = new Set<() => void>();
  private readonly issues = new Map<string, JournalLoadIssue[]>();

  load(deploymentId: string): readonly JournalEntry[] {
    const raw = localStorage.getItem(key(deploymentId));
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

  loadIssues(deploymentId: string): readonly JournalLoadIssue[] {
    this.load(deploymentId);
    return this.issues.get(deploymentId) ?? [];
  }

  save(entry: JournalEntry): void {
    const parsed = journalEntrySchema.parse(entry);
    const loaded = this.load(parsed.deploymentId);
    if ((this.issues.get(parsed.deploymentId)?.length ?? 0) > 0) {
      throw new Error('JOURNAL_STORAGE_INVALID');
    }
    const entries = loaded.filter((item) => item.clientOperationId !== parsed.clientOperationId);
    localStorage.setItem(key(parsed.deploymentId), JSON.stringify([...entries, parsed]));
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
