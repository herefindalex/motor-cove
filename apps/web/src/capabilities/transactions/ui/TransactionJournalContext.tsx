import { createContext, useContext, type PropsWithChildren } from 'react';
import type { TransactionJournal } from '../ports.js';

const TransactionJournalContext = createContext<TransactionJournal | undefined>(undefined);

export function TransactionJournalProvider({
  journal,
  children,
}: PropsWithChildren<{ journal: TransactionJournal }>) {
  return (
    <TransactionJournalContext.Provider value={journal}>
      {children}
    </TransactionJournalContext.Provider>
  );
}

export function useTransactionJournal(): TransactionJournal {
  const journal = useContext(TransactionJournalContext);
  if (!journal) throw new Error('TRANSACTION_JOURNAL_PROVIDER_MISSING');
  return journal;
}
