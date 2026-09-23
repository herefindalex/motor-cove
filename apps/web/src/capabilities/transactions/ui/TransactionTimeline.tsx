import type { TransactionJournal } from '../ports.js';
import { isProjectionCurrentlyReflected, type TransactionObservation } from '../model.js';
import { useJournalSnapshot } from '../use-journal-entries.js';

const statusLabel: Record<TransactionObservation, string> = {
  IDLE: 'Ready to start',
  PREPARING: 'Preparing request',
  AWAITING_WALLET: 'Waiting for wallet',
  REJECTED: 'Wallet request rejected',
  FAILED_BEFORE_SUBMIT: 'Failed before submission',
  SUBMITTED: 'Submitted; waiting for inclusion',
  INCLUDED_SUCCESS: 'Included successfully',
  INCLUDED_REVERTED: 'Included but reverted',
  UNKNOWN: 'Submission outcome unknown',
  REPLACED_OR_CANCELLED: 'Replaced or cancelled',
  ORPHANED: 'Receipt no longer canonical',
};

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
              <div className="timeline-heading">
                <strong>{entry.action.replaceAll('_', ' ')}</strong>
                <span className={`badge ${entry.status.toLowerCase()}`}>{entry.status}</span>
              </div>
              <span>{statusLabel[entry.status]}</span>
              {entry.currentTxHash && <code>{entry.currentTxHash}</code>}
              {entry.receiptBlockNumber && <span>Receipt block {entry.receiptBlockNumber}</span>}
              {entry.projectionObservation === 'NOT_REACHED' && (
                <span>Transaction included; marketplace data is still syncing.</span>
              )}
              {entry.projectionObservation === 'UNVERIFIABLE' && (
                <span>Projection verification unavailable.</span>
              )}
              {entry.projectionObservation === 'INCONSISTENT' && (
                <span>Projection evidence is inconsistent.</span>
              )}
              {entry.projectionObservation === 'REFLECTED' && (
                <span>
                  {isProjectionCurrentlyReflected(entry)
                    ? 'Marketplace projection reflects this transaction.'
                    : 'Historical projection evidence; current reflection unconfirmed.'}
                </span>
              )}
              {entry.lastErrorCategory && <span>{entry.lastErrorCategory}</span>}
              <time dateTime={entry.updatedAt}>Updated {entry.updatedAt}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
