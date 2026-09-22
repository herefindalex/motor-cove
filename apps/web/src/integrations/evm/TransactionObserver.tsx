import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePublicClient } from 'wagmi';
import type { PublicConfig } from '@motorcove/api-contracts';
import {
  isProjectionCurrentlyReflected,
  resumeJournalEntry,
  type JournalEntry,
  type TransactionObservationCoordinator,
  type TransactionJournal,
} from '../../capabilities/transactions/index.js';
import { motorCoveApi } from '../http/motorcove-api.js';
import { BrowserTransactionObservationCoordinator } from '../persistence/browser-observation-coordinator.js';
import { createTransactionChainReader } from './inspect-transaction.js';

export function TransactionObserver({
  config,
  journal,
  coordinator,
}: {
  config: PublicConfig;
  journal: TransactionJournal;
  coordinator?: TransactionObservationCoordinator;
}) {
  const deploymentId = config.deploymentId;
  const client = usePublicClient();
  const [entries, setEntries] = useState<readonly JournalEntry[]>(() => journal.load(deploymentId));
  const [candidates, setCandidates] = useState<Record<string, string>>({});
  const inFlight = useRef(new Set<string>());
  const observationCoordinator = useMemo(
    () => coordinator ?? new BrowserTransactionObservationCoordinator(),
    [coordinator],
  );
  const chain = useMemo(
    () =>
      client
        ? createTransactionChainReader(client, {
            chainId: Number(config.chainId),
            deploymentId: config.deploymentId as `0x${string}`,
            protocolVersion: config.protocolVersion,
            nftAddress: config.nftAddress as `0x${string}`,
            escrowAddress: config.escrowAddress as `0x${string}`,
          })
        : undefined,
    [client, config],
  );

  useEffect(() => {
    const refresh = () => setEntries(journal.load(deploymentId));
    refresh();
    return journal.subscribe(refresh);
  }, [deploymentId, journal]);

  const recheck = useCallback(
    async (
      entry: JournalEntry,
      candidateHash: `0x${string}` | undefined,
      mode: 'AUTOMATIC' | 'MANUAL',
    ) => {
      if (!chain) return;
      const ownsAutomaticGuard = mode === 'AUTOMATIC';
      if (ownsAutomaticGuard && inFlight.current.has(entry.clientOperationId)) return;
      if (ownsAutomaticGuard) inFlight.current.add(entry.clientOperationId);
      try {
        await observationCoordinator.run(
          { deploymentId: entry.deploymentId, clientOperationId: entry.clientOperationId },
          { wait: mode === 'MANUAL' },
          async () => {
            const current = journal
              .load(entry.deploymentId)
              .find((candidate) => candidate.clientOperationId === entry.clientOperationId);
            if (!current) return;
            await resumeJournalEntry(
              current,
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
          },
        );
      } finally {
        if (ownsAutomaticGuard) inFlight.current.delete(entry.clientOperationId);
      }
    },
    [chain, journal, observationCoordinator],
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
        await recheck(entry, undefined, 'AUTOMATIC');
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
  const storageUnavailable = journal
    .loadIssues(deploymentId)
    .some((issue) => issue.reason === 'STORAGE_UNAVAILABLE');

  return (
    <section aria-label="Transaction recovery" className="transaction-recovery">
      <h2>Transaction verification</h2>
      {storageUnavailable && (
        <p>
          Latest verification is available only in this tab. Persistent browser storage is
          unavailable; reloading will restore the last durable transaction evidence.
        </p>
      )}
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
                void recheck(entry, candidateHash, 'MANUAL');
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
