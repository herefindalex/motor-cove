import type { FundingObservationResponse } from '@motorcove/api-contracts';
import type { JournalEntry } from './model.js';
import type { TransactionJournal } from './ports.js';

export type InspectedTransaction =
  | { kind: 'PENDING'; transactionHash: `0x${string}` }
  | {
      kind: 'INCLUDED_REVERTED';
      transactionHash: `0x${string}`;
      blockNumber: bigint;
      blockHash: `0x${string}`;
      replacementKind?: 'REPRICED';
    }
  | {
      kind: 'INCLUDED_SUCCESS';
      transactionHash: `0x${string}`;
      blockNumber: bigint;
      blockHash: `0x${string}`;
      logIndex?: number;
      buyer?: `0x${string}`;
      amountWei?: bigint;
      replacementKind?: 'REPRICED';
    }
  | {
      kind: 'REPLACED_OR_CANCELLED';
      transactionHash: `0x${string}`;
      replacementHash: `0x${string}`;
      replacementKind: 'CANCELLED' | 'DIFFERENT_CALL';
    }
  | { kind: 'NONCANONICAL'; transactionHash: `0x${string}` }
  | { kind: 'INTENT_MISMATCH'; transactionHash: `0x${string}`; reason: string }
  | { kind: 'UNAVAILABLE'; transactionHash: `0x${string}`; reason: string };

export interface TransactionChainReader {
  inspectTransaction(
    entry: JournalEntry,
    transactionHash: `0x${string}`,
  ): Promise<InspectedTransaction>;
}

export interface FundingObservationReader {
  observeFunding(input: {
    saleId: string;
    deploymentId: string;
    observeTxHash: string;
    observeBlockNumber: string;
    observeBlockHash: string;
    observeLogIndex: number;
  }): Promise<FundingObservationResponse>;
}

export interface RecoveryPorts {
  readonly chain: TransactionChainReader;
  readonly observation: FundingObservationReader;
  readonly journal: TransactionJournal;
}

export type RecoveryResult =
  | { kind: 'HASH_REQUIRED' }
  | { kind: 'PENDING' }
  | { kind: 'REVERTED' }
  | { kind: 'INCLUDED' }
  | { kind: 'SYNCING' }
  | { kind: 'REFLECTED' }
  | { kind: 'INCONSISTENT' }
  | { kind: 'REJECTED_CANDIDATE'; reason: string }
  | { kind: 'SUPERSEDED' }
  | { kind: 'UNAVAILABLE'; reason: string };

function latestEntry(entry: JournalEntry, journal: TransactionJournal): JournalEntry {
  return (
    journal
      .load(entry.deploymentId)
      .find((candidate) => candidate.clientOperationId === entry.clientOperationId) ?? entry
  );
}

function storageWriteUnavailable(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'SecurityError' ||
      error.message.startsWith('JOURNAL_STORAGE_UNAVAILABLE'))
  );
}

async function update(
  entry: JournalEntry,
  ports: RecoveryPorts,
  values: Partial<JournalEntry>,
  verificationRequestId?: string,
): Promise<{ entry: JournalEntry; applied: boolean }> {
  const current = latestEntry(entry, ports.journal);
  if (
    verificationRequestId !== undefined &&
    current.verificationRequestId !== verificationRequestId
  )
    return { entry: current, applied: false };
  const next = { ...current, ...values, updatedAt: new Date().toISOString() };
  try {
    const retryDurableSave = ports.journal
      .loadIssues(entry.deploymentId)
      .some((issue) => issue.reason === 'STORAGE_UNAVAILABLE')
      ? ports.journal.retryDurableSave
      : undefined;
    const stored = await (retryDurableSave
      ? retryDurableSave.call(ports.journal, next)
      : ports.journal.save(next));
    return { entry: stored, applied: true };
  } catch (error) {
    if (error instanceof Error && error.message === 'JOURNAL_REVISION_CONFLICT')
      return { entry: latestEntry(entry, ports.journal), applied: false };
    if (ports.journal.saveVolatile && storageWriteUnavailable(error)) {
      return { entry: ports.journal.saveVolatile(next), applied: true };
    }
    throw error;
  }
}

export async function resumeJournalEntry(
  requestedEntry: JournalEntry,
  ports: RecoveryPorts,
  candidateHash?: `0x${string}`,
): Promise<RecoveryResult> {
  const entry = latestEntry(requestedEntry, ports.journal);
  const storedHash = entry.currentTxHash ?? entry.originalTxHash;
  const transactionHash = candidateHash ?? storedHash;
  if (!transactionHash) {
    await update(entry, ports, {
      status: 'UNKNOWN',
      verificationAvailability: 'AVAILABLE',
      lastErrorCategory: 'HASH_REQUIRED_FROM_WALLET_ACTIVITY',
    });
    return { kind: 'HASH_REQUIRED' };
  }
  const verifiedHash = transactionHash as `0x${string}`;

  const verificationRequestId = crypto.randomUUID();
  const verifying = (
    await update(entry, ports, {
      verificationAvailability: 'VERIFYING',
      verificationRequestId,
    })
  ).entry;
  const apply = (values: Partial<JournalEntry>) =>
    update(verifying, ports, values, verificationRequestId);
  const inspected = await ports.chain.inspectTransaction(verifying, verifiedHash);

  if (inspected.kind === 'UNAVAILABLE') {
    const result = await apply({
      verificationAvailability: 'UNAVAILABLE',
      lastErrorCategory: inspected.reason,
    });
    if (!result.applied) return { kind: 'SUPERSEDED' };
    return { kind: 'UNAVAILABLE', reason: inspected.reason };
  }
  if (inspected.kind === 'INTENT_MISMATCH') {
    const result = await apply({
      verificationAvailability: 'AVAILABLE',
      lastVerifiedAt: new Date().toISOString(),
      lastErrorCategory: `CANDIDATE_REJECTED:${inspected.reason}`,
    });
    if (!result.applied) return { kind: 'SUPERSEDED' };
    return { kind: 'REJECTED_CANDIDATE', reason: inspected.reason };
  }
  if (inspected.kind === 'NONCANONICAL') {
    const result = await apply({
      status: 'ORPHANED',
      projectionObservation: 'INCONSISTENT',
      verificationAvailability: 'AVAILABLE',
      lastVerifiedAt: new Date().toISOString(),
      lastErrorCategory: 'RECEIPT_BLOCK_NONCANONICAL',
    });
    if (!result.applied) return { kind: 'SUPERSEDED' };
    return { kind: 'INCONSISTENT' };
  }
  if (inspected.kind === 'REPLACED_OR_CANCELLED') {
    const result = await apply({
      currentTxHash: inspected.replacementHash,
      replacementKind: inspected.replacementKind,
      status: 'REPLACED_OR_CANCELLED',
      projectionObservation: 'INCONSISTENT',
      verificationAvailability: 'AVAILABLE',
      lastVerifiedAt: new Date().toISOString(),
      lastErrorCategory: `TRANSACTION_${inspected.replacementKind}`,
    });
    if (!result.applied) return { kind: 'SUPERSEDED' };
    return { kind: 'INCONSISTENT' };
  }

  const association = candidateHash
    ? 'INTENT_MATCH'
    : (verifying.association ?? 'EXACT_SUBMISSION');
  const evidenceSource = candidateHash
    ? 'USER_SUPPLIED'
    : (verifying.evidenceSource ?? 'WALLET_RETURNED');

  if (inspected.kind === 'PENDING') {
    const result = await apply({
      currentTxHash: verifiedHash,
      ...(verifying.originalTxHash ? {} : { originalTxHash: verifiedHash }),
      association,
      evidenceSource,
      status: 'SUBMITTED',
      verificationAvailability: 'AVAILABLE',
      lastVerifiedAt: new Date().toISOString(),
      lastErrorCategory: 'RECEIPT_NOT_AVAILABLE',
    });
    if (!result.applied) return { kind: 'SUPERSEDED' };
    return { kind: 'PENDING' };
  }

  if (inspected.kind === 'INCLUDED_REVERTED') {
    const result = await apply({
      currentTxHash: inspected.transactionHash,
      ...(verifying.originalTxHash ? {} : { originalTxHash: verifiedHash }),
      association,
      evidenceSource,
      receiptStatus: 'REVERTED',
      receiptBlockNumber: String(inspected.blockNumber),
      receiptBlockHash: inspected.blockHash,
      ...(inspected.replacementKind ? { replacementKind: inspected.replacementKind } : {}),
      status: 'INCLUDED_REVERTED',
      verificationAvailability: 'AVAILABLE',
      lastVerifiedAt: new Date().toISOString(),
      lastErrorCategory: undefined,
    });
    if (!result.applied) return { kind: 'SUPERSEDED' };
    return { kind: 'REVERTED' };
  }

  if (verifying.action !== 'FUND_SALE') {
    const result = await apply({
      currentTxHash: inspected.transactionHash,
      ...(verifying.originalTxHash ? {} : { originalTxHash: verifiedHash }),
      association,
      evidenceSource,
      receiptStatus: 'SUCCESS',
      receiptBlockNumber: String(inspected.blockNumber),
      receiptBlockHash: inspected.blockHash,
      ...(inspected.replacementKind ? { replacementKind: inspected.replacementKind } : {}),
      status: 'INCLUDED_SUCCESS',
      verificationAvailability: 'AVAILABLE',
      lastVerifiedAt: new Date().toISOString(),
      lastErrorCategory: undefined,
      projectionObservation: undefined,
    });
    if (!result.applied) return { kind: 'SUPERSEDED' };
    return { kind: 'INCLUDED' };
  }

  if (
    inspected.logIndex === undefined ||
    inspected.buyer === undefined ||
    inspected.amountWei === undefined
  ) {
    const result = await apply({
      verificationAvailability: 'AVAILABLE',
      lastVerifiedAt: new Date().toISOString(),
      lastErrorCategory: 'FUNDING_EVENT_EVIDENCE_MISSING',
    });
    if (!result.applied) return { kind: 'SUPERSEDED' };
    return { kind: 'INCONSISTENT' };
  }

  const projectionIdentityChanged =
    verifying.projectionTransactionHash !== inspected.transactionHash ||
    verifying.projectionBlockHash !== inspected.blockHash ||
    verifying.projectionLogIndex !== inspected.logIndex ||
    verifying.projectionDeploymentId !== verifying.deploymentId;
  const chainEvidenceResult = await apply({
    currentTxHash: inspected.transactionHash,
    ...(verifying.originalTxHash ? {} : { originalTxHash: verifiedHash }),
    association,
    evidenceSource,
    receiptStatus: 'SUCCESS',
    receiptBlockNumber: String(inspected.blockNumber),
    receiptBlockHash: inspected.blockHash,
    eventLogIndex: inspected.logIndex,
    eventBuyer: inspected.buyer,
    eventAmountWei: String(inspected.amountWei),
    ...(inspected.replacementKind ? { replacementKind: inspected.replacementKind } : {}),
    status: 'INCLUDED_SUCCESS',
    verificationAvailability: 'AVAILABLE',
    lastVerifiedAt: new Date().toISOString(),
    lastErrorCategory: undefined,
    ...(projectionIdentityChanged
      ? {
          projectionObservation: undefined,
          projectionTransactionHash: undefined,
          projectionBlockHash: undefined,
          projectionLogIndex: undefined,
          projectionDeploymentId: undefined,
          projectionBuildId: undefined,
        }
      : {}),
  });
  if (!chainEvidenceResult.applied) return { kind: 'SUPERSEDED' };
  const withChainEvidence = chainEvidenceResult.entry;

  if (!withChainEvidence.saleId) {
    const result = await update(
      withChainEvidence,
      ports,
      {
        projectionObservation: 'INCONSISTENT',
        lastErrorCategory: 'FUNDING_SALE_ID_MISSING',
      },
      verificationRequestId,
    );
    if (!result.applied) return { kind: 'SUPERSEDED' };
    return { kind: 'INCONSISTENT' };
  }

  try {
    const snapshot = await ports.observation.observeFunding({
      saleId: withChainEvidence.saleId,
      deploymentId: withChainEvidence.deploymentId,
      observeTxHash: inspected.transactionHash,
      observeBlockNumber: String(inspected.blockNumber),
      observeBlockHash: inspected.blockHash,
      observeLogIndex: inspected.logIndex,
    });
    const observation = snapshot.data.observation;
    const projectionObservation =
      observation.coverage === 'NOT_REACHED'
        ? 'NOT_REACHED'
        : observation.coverage === 'UNVERIFIABLE'
          ? 'UNVERIFIABLE'
          : observation.eventLookup === 'MATCHED' && observation.projectionEffect === 'CONSISTENT'
            ? 'REFLECTED'
            : 'INCONSISTENT';
    const result = await update(
      withChainEvidence,
      ports,
      {
        projectionObservation,
        projectionTransactionHash: inspected.transactionHash,
        projectionBlockHash: inspected.blockHash,
        projectionLogIndex: inspected.logIndex,
        projectionDeploymentId: withChainEvidence.deploymentId,
        projectionBuildId: snapshot.provenance.projectionBuildId,
        lastVerifiedAt: new Date().toISOString(),
        verificationAvailability: 'AVAILABLE',
        lastErrorCategory:
          projectionObservation === 'INCONSISTENT' ? 'PROJECTION_EVIDENCE_MISMATCH' : undefined,
      },
      verificationRequestId,
    );
    if (!result.applied) return { kind: 'SUPERSEDED' };
    if (projectionObservation === 'REFLECTED') return { kind: 'REFLECTED' };
    if (projectionObservation === 'NOT_REACHED') return { kind: 'SYNCING' };
    return { kind: 'INCONSISTENT' };
  } catch (error) {
    const result = await update(
      withChainEvidence,
      ports,
      {
        verificationAvailability: 'UNAVAILABLE',
        lastErrorCategory: 'PROJECTION_OBSERVATION_UNAVAILABLE',
      },
      verificationRequestId,
    );
    if (!result.applied) return { kind: 'SUPERSEDED' };
    return { kind: 'UNAVAILABLE', reason: error instanceof Error ? error.message : String(error) };
  }
}
