import type { FundingObservationResponse } from '@motorcove/api-contracts';
import type { JournalEntry } from './model.js';
import type { TransactionJournal } from './ports.js';

export type InspectedFundingTransaction =
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
      logIndex: number;
      buyer: `0x${string}`;
      amountWei: bigint;
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

export interface FundingChainReader {
  inspectFunding(
    entry: JournalEntry,
    transactionHash: `0x${string}`,
  ): Promise<InspectedFundingTransaction>;
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
  readonly chain: FundingChainReader;
  readonly observation: FundingObservationReader;
  readonly journal: TransactionJournal;
}

export type RecoveryResult =
  | { kind: 'HASH_REQUIRED' }
  | { kind: 'PENDING' }
  | { kind: 'REVERTED' }
  | { kind: 'SYNCING' }
  | { kind: 'REFLECTED' }
  | { kind: 'INCONSISTENT' }
  | { kind: 'REJECTED_CANDIDATE'; reason: string }
  | { kind: 'UNAVAILABLE'; reason: string };

function update(
  entry: JournalEntry,
  ports: RecoveryPorts,
  values: Partial<JournalEntry>,
): JournalEntry {
  const next = { ...entry, ...values, updatedAt: new Date().toISOString() };
  ports.journal.save(next);
  return next;
}

export async function resumeJournalEntry(
  entry: JournalEntry,
  ports: RecoveryPorts,
  candidateHash?: `0x${string}`,
): Promise<RecoveryResult> {
  const storedHash = entry.currentTxHash ?? entry.originalTxHash;
  const transactionHash = candidateHash ?? storedHash;
  if (!transactionHash) {
    update(entry, ports, {
      status: 'UNKNOWN',
      verificationAvailability: 'AVAILABLE',
      lastErrorCategory: 'HASH_REQUIRED_FROM_WALLET_ACTIVITY',
    });
    return { kind: 'HASH_REQUIRED' };
  }

  update(entry, ports, { verificationAvailability: 'VERIFYING' });
  const inspected = await ports.chain.inspectFunding(entry, transactionHash as `0x${string}`);
  if (inspected.kind === 'UNAVAILABLE') {
    update(entry, ports, {
      verificationAvailability: 'UNAVAILABLE',
      lastErrorCategory: inspected.reason,
    });
    return { kind: 'UNAVAILABLE', reason: inspected.reason };
  }
  if (inspected.kind === 'INTENT_MISMATCH') {
    update(entry, ports, {
      verificationAvailability: 'AVAILABLE',
      lastVerifiedAt: new Date().toISOString(),
      lastErrorCategory: `CANDIDATE_REJECTED:${inspected.reason}`,
    });
    return { kind: 'REJECTED_CANDIDATE', reason: inspected.reason };
  }
  if (inspected.kind === 'NONCANONICAL') {
    update(entry, ports, {
      status: 'ORPHANED',
      verificationAvailability: 'AVAILABLE',
      lastVerifiedAt: new Date().toISOString(),
      lastErrorCategory: 'RECEIPT_BLOCK_NONCANONICAL',
    });
    return { kind: 'INCONSISTENT' };
  }
  if (inspected.kind === 'REPLACED_OR_CANCELLED') {
    update(entry, ports, {
      currentTxHash: inspected.replacementHash,
      replacementKind: inspected.replacementKind,
      status: 'REPLACED_OR_CANCELLED',
      verificationAvailability: 'AVAILABLE',
      lastVerifiedAt: new Date().toISOString(),
      lastErrorCategory: `TRANSACTION_${inspected.replacementKind}`,
    });
    return { kind: 'INCONSISTENT' };
  }

  const association = candidateHash ? 'INTENT_MATCH' : (entry.association ?? 'EXACT_SUBMISSION');
  const evidenceSource = candidateHash
    ? 'USER_SUPPLIED'
    : (entry.evidenceSource ?? 'WALLET_RETURNED');
  if (inspected.kind === 'PENDING') {
    update(entry, ports, {
      currentTxHash: transactionHash,
      ...(entry.originalTxHash ? {} : { originalTxHash: transactionHash }),
      association,
      evidenceSource,
      status: 'SUBMITTED',
      verificationAvailability: 'AVAILABLE',
      lastVerifiedAt: new Date().toISOString(),
      lastErrorCategory: 'RECEIPT_NOT_AVAILABLE',
    });
    return { kind: 'PENDING' };
  }

  if (inspected.kind === 'INCLUDED_REVERTED') {
    update(entry, ports, {
      currentTxHash: inspected.transactionHash,
      ...(entry.originalTxHash ? {} : { originalTxHash: transactionHash }),
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
    return { kind: 'REVERTED' };
  }

  const withChainEvidence = update(entry, ports, {
    currentTxHash: inspected.transactionHash,
    ...(entry.originalTxHash ? {} : { originalTxHash: transactionHash }),
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
  });

  if (!withChainEvidence.saleId) {
    update(withChainEvidence, ports, {
      projectionObservation: 'INCONSISTENT',
      lastErrorCategory: 'FUNDING_SALE_ID_MISSING',
    });
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
    update(withChainEvidence, ports, {
      projectionObservation,
      lastVerifiedAt: new Date().toISOString(),
      verificationAvailability: 'AVAILABLE',
      lastErrorCategory:
        projectionObservation === 'INCONSISTENT' ? 'PROJECTION_EVIDENCE_MISMATCH' : undefined,
    });
    if (projectionObservation === 'REFLECTED') return { kind: 'REFLECTED' };
    if (projectionObservation === 'NOT_REACHED') return { kind: 'SYNCING' };
    return { kind: 'INCONSISTENT' };
  } catch (error) {
    update(withChainEvidence, ports, {
      verificationAvailability: 'UNAVAILABLE',
      lastErrorCategory: 'PROJECTION_OBSERVATION_UNAVAILABLE',
    });
    return { kind: 'UNAVAILABLE', reason: error instanceof Error ? error.message : String(error) };
  }
}
