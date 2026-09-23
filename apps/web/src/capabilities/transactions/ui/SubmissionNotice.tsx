import type { SubmissionResult } from '../model.js';

export function SubmissionNotice({
  result,
  error,
}: {
  result?: SubmissionResult | undefined;
  error?: string | undefined;
}) {
  if (error)
    return (
      <output className="danger" role="alert">
        {error}
      </output>
    );
  if (!result) return null;
  if (result.kind === 'submitted' || result.kind === 'submitted-non-durable') {
    return (
      <output role={result.kind === 'submitted-non-durable' ? 'alert' : 'status'}>
        <span>Transaction submitted. Check the timeline for its latest status. </span>
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
            The transaction was submitted, but the journal could not persist it. Reloading may lose
            local tracking context; tracking continues in this tab.
          </span>
        )}
      </output>
    );
  }
  if (result.kind === 'rejected')
    return (
      <output role={result.durable ? 'status' : 'alert'}>
        Wallet request rejected. No transaction submission was confirmed.
        {!result.durable &&
          ' The wallet outcome is available only in this tab because journal storage failed.'}
      </output>
    );
  if (result.kind === 'failed')
    return (
      <output className="danger" role="alert">
        {result.message}
      </output>
    );
  return (
    <output className="danger" role="alert">
      Submission outcome is unknown. Check wallet activity before trying again.
      {!result.durable &&
        ' This outcome is available only in this tab because journal storage failed.'}
    </output>
  );
}
