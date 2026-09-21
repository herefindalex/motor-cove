import { useEffect, useState } from 'react';
import type { JournalEntry } from './model.js';
import type { TransactionJournal } from './ports.js';

export function useJournalEntries(
  journal: TransactionJournal,
  deploymentId: string | undefined,
): readonly JournalEntry[] {
  const [entries, setEntries] = useState<readonly JournalEntry[]>(() =>
    deploymentId ? journal.load(deploymentId) : [],
  );

  useEffect(() => {
    if (!deploymentId) {
      setEntries([]);
      return;
    }
    const refresh = () => setEntries(journal.load(deploymentId));
    refresh();
    return journal.subscribe(refresh);
  }, [deploymentId, journal]);

  return entries;
}
