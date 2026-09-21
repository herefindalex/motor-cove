import type { JournalEntry } from './model.js';

export interface JournalLoadIssue {
  readonly deploymentId: string;
  readonly reason: 'CORRUPT_STORAGE' | 'INVALID_ENTRY';
  readonly detail: string;
}

export interface TransactionJournal {
  load(deploymentId: string): readonly JournalEntry[];
  loadIssues(deploymentId: string): readonly JournalLoadIssue[];
  save(entry: JournalEntry): void | Promise<void>;
  saveVolatile?(entry: JournalEntry): void;
  subscribe(listener: () => void): () => void;
}
