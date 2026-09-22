import type { JournalEntry } from './model.js';

export interface JournalLoadIssue {
  readonly deploymentId: string;
  readonly reason: 'CORRUPT_STORAGE' | 'INVALID_ENTRY' | 'STORAGE_UNAVAILABLE';
  readonly detail: string;
}

export interface TransactionJournal {
  load(deploymentId: string): readonly JournalEntry[];
  loadIssues(deploymentId: string): readonly JournalLoadIssue[];
  save(entry: JournalEntry): JournalEntry | Promise<JournalEntry>;
  saveVolatile?(entry: JournalEntry): JournalEntry;
  subscribe(listener: () => void): () => void;
}
