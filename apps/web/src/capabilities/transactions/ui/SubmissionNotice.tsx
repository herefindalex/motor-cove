import type { SubmissionResult } from '../model.js';

export function SubmissionNotice({
  result,
  error,
}: {
  result?: SubmissionResult | undefined;
  error?: string | undefined;
}) {
  if (error) return <output className="danger">{error}</output>;
  if (!result) return null;
  if (result.kind === 'submitted' || result.kind === 'submitted-non-durable') {
    return (
      <output role={result.kind === 'submitted-non-durable' ? 'alert' : undefined}>
        <span>Submitted </span>
        <code>{result.hash}</code>{' '}
        <button
          type="button"
          aria-label="Copy transaction hash"
          onClick={() => void navigator.clipboard?.writeText(result.hash)}
        >
          Copy hash
        </button>
        {result.kind === 'submitted-non-durable' && (
          <span>
            {' '}
            The wallet submission succeeded, but the journal could not persist it. Tracking will
            continue in this tab; reloading can lose recovery context.
          </span>
        )}
      </output>
    );
  }
  if (result.kind === 'rejected')
    return (
      <output role={result.durable ? undefined : 'alert'}>
        Wallet request rejected.
        {!result.durable &&
          ' The wallet outcome is available only in this tab because journal storage failed.'}
      </output>
    );
  if (result.kind === 'failed') return <output className="danger">{result.message}</output>;
  return (
    <output className="danger" role={result.durable ? undefined : 'alert'}>
      Submission outcome is unknown. Check wallet activity before starting another transaction.
      {!result.durable &&
        ' This outcome is available only in this tab because journal storage failed.'}
    </output>
  );
}
