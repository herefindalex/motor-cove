import type { JournalEntry, SubmissionResult } from './model.js';
import type { TransactionJournal, TransactionSubmissionCoordinator } from './ports.js';

export interface SubmissionContext {
  readonly deploymentId: `0x${string}`;
  readonly chainId: number;
  readonly account: `0x${string}`;
  readonly protocolVersion: string;
  readonly contextStillCurrent: () => boolean;
}

export interface SubmissionAction {
  readonly name: string;
  readonly saleId?: bigint;
  readonly tokenId?: bigint;
  readonly value: bigint;
  readonly contract: `0x${string}`;
  readonly calldata: `0x${string}`;
  readonly retryOf?: string;
  readonly simulate: () => Promise<unknown>;
  readonly submit: () => Promise<`0x${string}`>;
  readonly readNonce: (hash: `0x${string}`) => Promise<number>;
}

function rejectedByUser(error: unknown): boolean {
  return (
    (typeof error === 'object' && error !== null && 'code' in error && error.code === 4001) ||
    (error instanceof Error &&
      (error.name === 'UserRejectedRequestError' ||
        /user rejected|user denied/i.test(error.message)))
  );
}

function revisionConflict(error: unknown): boolean {
  return error instanceof Error && error.message === 'JOURNAL_REVISION_CONFLICT';
}

function sameSubmissionIntent(left: JournalEntry, right: JournalEntry): boolean {
  return (
    left.clientOperationId === right.clientOperationId &&
    left.deploymentId === right.deploymentId &&
    left.chainId === right.chainId &&
    left.account === right.account &&
    left.protocolVersion === right.protocolVersion &&
    left.action === right.action &&
    left.saleId === right.saleId &&
    left.tokenId === right.tokenId &&
    left.intendedContract === right.intendedContract &&
    left.intendedCalldata === right.intendedCalldata &&
    left.valueWei === right.valueWei
  );
}

async function persistReturnedHash(
  journal: TransactionJournal,
  submitted: JournalEntry,
): Promise<JournalEntry> {
  try {
    return await journal.save(submitted);
  } catch (error) {
    if (!revisionConflict(error)) throw error;
    const current = journal
      .load(submitted.deploymentId)
      .find((entry) => entry.clientOperationId === submitted.clientOperationId);
    if (!current || !sameSubmissionIntent(current, submitted)) throw error;

    const durableHash = current.currentTxHash ?? current.originalTxHash;
    const returnedHash = submitted.currentTxHash ?? submitted.originalTxHash;
    if (!returnedHash) throw error;
    if (durableHash) {
      if (durableHash.toLowerCase() !== returnedHash.toLowerCase()) throw error;
      return current;
    }

    return journal.save({
      ...current,
      updatedAt: submitted.updatedAt,
      originalTxHash: submitted.originalTxHash,
      currentTxHash: submitted.currentTxHash,
      evidenceSource: submitted.evidenceSource,
      association: submitted.association,
      status: 'SUBMITTED',
      verificationAvailability: undefined,
      verificationRequestId: undefined,
      lastErrorCategory: undefined,
    });
  }
}

function sameWalletRequest(left: JournalEntry, right: JournalEntry): boolean {
  return (
    sameSubmissionIntent(left, right) &&
    left.walletRequestStartedAt !== undefined &&
    left.walletRequestStartedAt === right.walletRequestStartedAt
  );
}

function hasTransactionEvidence(entry: JournalEntry): boolean {
  return (
    Boolean(
      entry.currentTxHash ??
      entry.originalTxHash ??
      entry.receiptStatus ??
      entry.receiptBlockHash ??
      entry.association ??
      entry.projectionTransactionHash,
    ) || entry.eventLogIndex !== undefined
  );
}

function mergeWalletOutcome(
  current: JournalEntry,
  outcome: 'REJECTED' | 'UNKNOWN',
  outcomeAt: string,
): JournalEntry {
  const keepTransactionEvidence = hasTransactionEvidence(current);
  return {
    ...current,
    updatedAt: outcomeAt,
    walletRequestOutcome: outcome,
    walletRequestOutcomeAt: outcomeAt,
    ...(keepTransactionEvidence
      ? {}
      : {
          status: outcome === 'REJECTED' ? ('REJECTED' as const) : ('UNKNOWN' as const),
          lastErrorCategory: outcome === 'REJECTED' ? 'WALLET_REJECTED' : 'SUBMISSION_UNKNOWN',
        }),
  };
}

async function persistWalletOutcome(
  journal: TransactionJournal,
  awaitingWallet: JournalEntry,
  outcome: 'REJECTED' | 'UNKNOWN',
): Promise<boolean> {
  const outcomeAt = new Date().toISOString();
  let candidate = mergeWalletOutcome(awaitingWallet, outcome, outcomeAt);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await journal.save(candidate);
      return true;
    } catch (error) {
      const current = journal
        .load(awaitingWallet.deploymentId)
        .find((entry) => entry.clientOperationId === awaitingWallet.clientOperationId);
      if (!revisionConflict(error)) {
        const volatile =
          current && sameWalletRequest(current, awaitingWallet) ? current : candidate;
        journal.saveVolatile?.(mergeWalletOutcome(volatile, outcome, outcomeAt));
        return false;
      }
      if (!current || !sameWalletRequest(current, awaitingWallet)) return false;
      candidate = mergeWalletOutcome(current, outcome, outcomeAt);
    }
  }
  const current = journal
    .load(awaitingWallet.deploymentId)
    .find((entry) => entry.clientOperationId === awaitingWallet.clientOperationId);
  if (current && sameWalletRequest(current, awaitingWallet))
    journal.saveVolatile?.(mergeWalletOutcome(current, outcome, outcomeAt));
  return false;
}

async function submitOwnedOperation(
  context: SubmissionContext,
  action: SubmissionAction,
  journal: TransactionJournal,
): Promise<SubmissionResult> {
  const createdAt = new Date().toISOString();
  let base: JournalEntry = {
    schemaVersion: 1,
    clientOperationId: crypto.randomUUID(),
    revision: 0,
    ...(action.retryOf === undefined ? {} : { retryOf: action.retryOf }),
    createdAt,
    updatedAt: createdAt,
    deploymentId: context.deploymentId,
    chainId: context.chainId,
    account: context.account,
    protocolVersion: context.protocolVersion,
    action: action.name,
    ...(action.saleId === undefined ? {} : { saleId: String(action.saleId) }),
    ...(action.tokenId === undefined ? {} : { tokenId: String(action.tokenId) }),
    intendedContract: action.contract,
    intendedCalldata: action.calldata,
    calldataSummary: action.name,
    valueWei: String(action.value),
    status: 'PREPARING',
  };

  // Durable intent boundary: a failed write prevents any wallet request.
  base = await journal.save(base);

  try {
    if (!context.contextStillCurrent()) throw new Error('OPERATION_CONTEXT_CHANGED');
    await action.simulate();
    if (!context.contextStillCurrent()) throw new Error('OPERATION_CONTEXT_CHANGED');
  } catch (error) {
    await journal.save({
      ...base,
      updatedAt: new Date().toISOString(),
      status: 'FAILED_BEFORE_SUBMIT',
      lastErrorCategory:
        error instanceof Error && error.message === 'OPERATION_CONTEXT_CHANGED'
          ? 'OPERATION_CONTEXT_CHANGED'
          : 'CHAIN_PRECONDITION_FAILED',
    });
    return {
      kind: 'failed',
      message: error instanceof Error ? error.message : String(error),
      clientOperationId: base.clientOperationId,
    };
  }

  let awaitingWallet: JournalEntry = {
    ...base,
    updatedAt: new Date().toISOString(),
    walletRequestStartedAt: new Date().toISOString(),
    status: 'AWAITING_WALLET',
  };
  awaitingWallet = await journal.save(awaitingWallet);
  if (!context.contextStillCurrent()) {
    await journal.save({
      ...awaitingWallet,
      updatedAt: new Date().toISOString(),
      status: 'FAILED_BEFORE_SUBMIT',
      lastErrorCategory: 'OPERATION_CONTEXT_CHANGED',
    });
    return {
      kind: 'failed',
      message: 'OPERATION_CONTEXT_CHANGED',
      clientOperationId: base.clientOperationId,
    };
  }

  let hash: `0x${string}`;
  try {
    hash = await action.submit();
  } catch (error) {
    const rejected = rejectedByUser(error);
    const durable = await persistWalletOutcome(
      journal,
      awaitingWallet,
      rejected ? 'REJECTED' : 'UNKNOWN',
    );
    return rejected
      ? { kind: 'rejected', clientOperationId: base.clientOperationId, durable }
      : { kind: 'unknown', clientOperationId: base.clientOperationId, durable };
  }

  let submitted: JournalEntry = {
    ...awaitingWallet,
    updatedAt: new Date().toISOString(),
    originalTxHash: hash,
    currentTxHash: hash,
    evidenceSource: 'WALLET_RETURNED',
    association: 'EXACT_SUBMISSION',
    status: 'SUBMITTED',
  };
  try {
    submitted = await persistReturnedHash(journal, submitted);
  } catch {
    submitted = journal.saveVolatile?.(submitted) ?? submitted;
    return {
      kind: 'submitted-non-durable',
      hash,
      clientOperationId: submitted.clientOperationId,
    };
  }

  try {
    const nonce = await action.readNonce(hash);
    const current =
      journal
        .load(context.deploymentId)
        .find((entry) => entry.clientOperationId === submitted.clientOperationId) ?? submitted;
    await journal.save({ ...current, updatedAt: new Date().toISOString(), nonce });
  } catch {
    // Optional enrichment cannot erase the already durable hash.
  }
  return { kind: 'submitted', hash, clientOperationId: submitted.clientOperationId };
}

const inFlightSubmissionIntents = new Set<string>();
const inProcessSubmissionCoordinator: TransactionSubmissionCoordinator = {
  async run<T>(intentKey: string, operation: () => Promise<T>) {
    if (inFlightSubmissionIntents.has(intentKey)) return { acquired: false };
    inFlightSubmissionIntents.add(intentKey);
    try {
      return { acquired: true, result: await operation() };
    } finally {
      inFlightSubmissionIntents.delete(intentKey);
    }
  },
};

function submissionIntentKey(context: SubmissionContext, action: SubmissionAction): string {
  return JSON.stringify([
    context.deploymentId.toLowerCase(),
    context.chainId,
    context.account.toLowerCase(),
    context.protocolVersion,
    action.name,
    action.saleId?.toString() ?? null,
    action.tokenId?.toString() ?? null,
    action.contract.toLowerCase(),
    action.calldata.toLowerCase(),
    action.value.toString(),
  ]);
}

export async function submitOperation(
  context: SubmissionContext,
  action: SubmissionAction,
  journal: TransactionJournal,
  coordinator: TransactionSubmissionCoordinator = inProcessSubmissionCoordinator,
): Promise<SubmissionResult> {
  const intentKey = submissionIntentKey(context, action);
  const ownership = await coordinator.run(intentKey, () =>
    submitOwnedOperation(context, action, journal),
  );
  if (!ownership.acquired) throw new Error('OPERATION_ALREADY_IN_FLIGHT');
  return ownership.result;
}
