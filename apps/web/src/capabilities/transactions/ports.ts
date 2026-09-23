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
  retryDurableSave?(entry: JournalEntry): JournalEntry | Promise<JournalEntry>;
  subscribe(listener: () => void): () => void;
}

export interface TransactionObservationCoordinator {
  run<T>(
    identity: { readonly deploymentId: string; readonly clientOperationId: string },
    options: { readonly wait: boolean },
    operation: () => Promise<T>,
  ): Promise<{ readonly acquired: false } | { readonly acquired: true; readonly result: T }>;
}

export interface TransactionSubmissionCoordinator {
  run<T>(
    intentKey: string,
    operation: () => Promise<T>,
  ): Promise<{ readonly acquired: false } | { readonly acquired: true; readonly result: T }>;
}
