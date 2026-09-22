import type { TransactionJournal } from '../ports.js';
import { useJournalSnapshot } from '../use-journal-entries.js';

export function TransactionTimeline({
  deploymentId,
  journal,
  saleId,
}: {
  deploymentId: string;
  journal: TransactionJournal;
  saleId?: string | undefined;
}) {
  const { entries, issues } = useJournalSnapshot(journal, deploymentId);
  const visible = entries
    .filter((entry) => saleId === undefined || entry.saleId === saleId)
    .slice(-8)
    .reverse();

  return (
    <section aria-label="Transaction timeline">
      <h2>Transaction timeline</h2>
      {issues.some((issue) => issue.reason === 'STORAGE_UNAVAILABLE') && (
        <p className="error" role="status">
          Browser transaction storage is unavailable. Entries shown here may exist only in this tab
          and will not survive a reload.
        </p>
      )}
      {visible.length === 0 ? (
        <p className="empty">No wallet operations recorded for deployment.</p>
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
