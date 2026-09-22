import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePublicClient } from 'wagmi';
import {
  isProjectionCurrentlyReflected,
  resumeJournalEntry,
  type JournalEntry,
  type TransactionJournal,
} from '../../capabilities/transactions/index.js';
import { motorCoveApi } from '../http/motorcove-api.js';
import { createTransactionChainReader } from './inspect-transaction.js';

export function TransactionObserver({
  deploymentId,
  journal,
}: {
  deploymentId: string;
  journal: TransactionJournal;
}) {
  const client = usePublicClient();
  const [entries, setEntries] = useState<readonly JournalEntry[]>(() => journal.load(deploymentId));
  const [candidates, setCandidates] = useState<Record<string, string>>({});
  const inFlight = useRef(new Set<string>());
  const chain = useMemo(
    () => (client ? createTransactionChainReader(client) : undefined),
    [client],
  );

  useEffect(() => {
    const refresh = () => setEntries(journal.load(deploymentId));
    refresh();
    return journal.subscribe(refresh);
  }, [deploymentId, journal]);

  const recheck = useCallback(
    async (entry: JournalEntry, candidateHash?: `0x${string}`) => {
      if (!chain) return;
      if (inFlight.current.has(entry.clientOperationId)) return;
      inFlight.current.add(entry.clientOperationId);
      try {
        await resumeJournalEntry(
          entry,
          {
            chain,
            observation: {
              observeFunding: (input) =>
                motorCoveApi.fundingObservation(input.saleId, {
                  deploymentId: input.deploymentId,
                  observeTxHash: input.observeTxHash,
                  observeBlockNumber: input.observeBlockNumber,
                  observeBlockHash: input.observeBlockHash,
                  observeLogIndex: input.observeLogIndex,
                }),
            },
            journal,
          },
          candidateHash,
        );
      } finally {
        inFlight.current.delete(entry.clientOperationId);
      }
    },
    [chain, journal],
  );

  useEffect(() => {
    if (!chain) return;
    let stopped = false;
    const observe = async () => {
      const recoverable = journal
        .load(deploymentId)
        .filter((entry) =>
          [
            'AWAITING_WALLET',
            'SUBMITTED',
            'INCLUDED_SUCCESS',
            'INCLUDED_REVERTED',
            'UNKNOWN',
            'ORPHANED',
          ].includes(entry.status),
        );
      for (const entry of recoverable) {
        if (stopped) return;
        if (entry.status === 'UNKNOWN' && !entry.currentTxHash && !entry.originalTxHash) continue;
        await recheck(entry);
      }
    };
    void observe();
    const timer = window.setInterval(() => void observe(), 3_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [chain, deploymentId, journal, recheck]);

  const recoverable = entries.filter(
    (entry) => !['REJECTED', 'FAILED_BEFORE_SUBMIT'].includes(entry.status),
  );
  if (recoverable.length === 0) return null;

  return (
    <section aria-label="Transaction recovery" className="transaction-recovery">
      <h2>Transaction verification</h2>
      {recoverable.map((entry) => {
        const hash = entry.currentTxHash ?? entry.originalTxHash;
        const candidate = candidates[entry.clientOperationId] ?? '';
        const canSupplyCandidate = !hash || entry.verificationAvailability === 'UNAVAILABLE';
        return (
          <article key={entry.clientOperationId}>
            <p>
              Original account <code>{entry.account}</code> on chain {entry.chainId}. Verification
              always uses this saved operation context.
            </p>
            {entry.projectionObservation === 'NOT_REACHED' && (
              <p>Payment executed on-chain. Marketplace data is syncing.</p>
            )}
            {entry.action === 'FUND_SALE' && isProjectionCurrentlyReflected(entry) && (
              <p>This funding payment is reflected in the marketplace projection.</p>
            )}
            {entry.verificationAvailability === 'UNAVAILABLE' && (
              <p>Last known evidence is retained. Verification is currently unavailable.</p>
            )}
            {canSupplyCandidate && (
              <label>
                {hash
                  ? 'Alternative transaction hash from wallet activity'
                  : 'Candidate transaction hash from wallet activity'}
                <input
                  aria-label={
                    hash
                      ? 'Alternative transaction hash from wallet activity'
                      : 'Candidate transaction hash from wallet activity'
                  }
                  value={candidate}
                  onChange={(event) =>
                    setCandidates((current) => ({
                      ...current,
                      [entry.clientOperationId]: event.target.value,
                    }))
                  }
                  placeholder="0x…"
                />
              </label>
            )}
            <button
              type="button"
              onClick={() => {
                const candidateHash = /^0x[0-9a-fA-F]{64}$/.test(candidate)
                  ? (candidate as `0x${string}`)
                  : undefined;
                void recheck(entry, candidateHash);
              }}
            >
              Recheck evidence
            </button>
            {canSupplyCandidate && (
              <p>
                The saved or returned transaction may be unavailable from this RPC. Rechecking an
                alternative hash is read-only and still verifies the saved account, chain,
                deployment, target, calldata, and value. A new transaction must be started
                separately by an explicit action.
              </p>
            )}
          </article>
        );
      })}
    </section>
  );
}
