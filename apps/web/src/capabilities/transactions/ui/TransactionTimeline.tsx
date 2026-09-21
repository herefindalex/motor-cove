import { useEffect, useState } from 'react';
import type { JournalEntry } from '../model.js';
import type { TransactionJournal } from '../ports.js';

export function TransactionTimeline({
  deploymentId,
  journal,
  saleId,
}: {
  deploymentId: string;
  journal: TransactionJournal;
  saleId?: string | undefined;
}) {
  const [entries, setEntries] = useState<readonly JournalEntry[]>(() => journal.load(deploymentId));

  useEffect(() => {
    const refresh = () => setEntries(journal.load(deploymentId));
    refresh();
    return journal.subscribe(refresh);
  }, [deploymentId, journal]);

  const visible = entries
    .filter((entry) => saleId === undefined || entry.saleId === saleId)
    .slice(-8)
    .reverse();

  return (
    <section aria-label="Transaction timeline">
      <h2>Transaction timeline</h2>
      {visible.length === 0 ? (
        <p className="empty">No wallet operations recorded for this deployment.</p>
      ) : (
        <ol className="transaction-timeline">
          {visible.map((entry) => (
            <li key={entry.clientOperationId}>
              <strong>{entry.action.replaceAll('_', ' ')}</strong>
              <span className={`badge ${entry.status.toLowerCase()}`}>{entry.status}</span>
              {entry.currentTxHash && <code>{entry.currentTxHash}</code>}
              {entry.receiptBlockNumber && <span>Block {entry.receiptBlockNumber}</span>}
              {entry.lastErrorCategory && <span>{entry.lastErrorCategory}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
