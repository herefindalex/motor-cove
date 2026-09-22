import { useEffect, useState } from 'react';
import type { JournalEntry } from './model.js';
import type { JournalLoadIssue, TransactionJournal } from './ports.js';

export interface JournalSnapshot {
  readonly entries: readonly JournalEntry[];
  readonly issues: readonly JournalLoadIssue[];
}

export function useJournalSnapshot(
  journal: TransactionJournal,
  deploymentId: string | undefined,
): JournalSnapshot {
  const read = (): JournalSnapshot =>
    deploymentId
      ? {
          entries: journal.load(deploymentId),
          issues: journal.loadIssues(deploymentId),
        }
      : { entries: [], issues: [] };
  const [snapshot, setSnapshot] = useState<JournalSnapshot>(read);

  useEffect(() => {
    const refresh = () => setSnapshot(read());
    refresh();
    return deploymentId ? journal.subscribe(refresh) : undefined;
  }, [deploymentId, journal]);

  return snapshot;
}

export function useJournalEntries(
  journal: TransactionJournal,
  deploymentId: string | undefined,
): readonly JournalEntry[] {
  return useJournalSnapshot(journal, deploymentId).entries;
}
