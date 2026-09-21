import type { JournalEntry, SubmissionResult } from './model.js';
import type { TransactionJournal } from './ports.js';

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

export async function submitOperation(
  context: SubmissionContext,
  action: SubmissionAction,
  journal: TransactionJournal,
): Promise<SubmissionResult> {
  const createdAt = new Date().toISOString();
  const base: JournalEntry = {
    schemaVersion: 1,
    clientOperationId: crypto.randomUUID(),
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
  journal.save(base);

  try {
    if (!context.contextStillCurrent()) throw new Error('OPERATION_CONTEXT_CHANGED');
    await action.simulate();
    if (!context.contextStillCurrent()) throw new Error('OPERATION_CONTEXT_CHANGED');
  } catch (error) {
    journal.save({
      ...base,
      updatedAt: new Date().toISOString(),
      status: 'FAILED_BEFORE_SUBMIT',
      lastErrorCategory:
        error instanceof Error && error.message === 'OPERATION_CONTEXT_CHANGED'
          ? 'OPERATION_CONTEXT_CHANGED'
          : 'CHAIN_PRECONDITION_FAILED',
    });
    return { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
  }

  const awaitingWallet: JournalEntry = {
    ...base,
    updatedAt: new Date().toISOString(),
    walletRequestStartedAt: new Date().toISOString(),
    status: 'AWAITING_WALLET',
  };
  journal.save(awaitingWallet);

  let hash: `0x${string}`;
  try {
    hash = await action.submit();
  } catch (error) {
    const rejected = rejectedByUser(error);
    try {
      journal.save({
        ...awaitingWallet,
        updatedAt: new Date().toISOString(),
        status: rejected ? 'REJECTED' : 'UNKNOWN',
        lastErrorCategory: rejected ? 'WALLET_REJECTED' : 'SUBMISSION_UNKNOWN',
      });
    } catch {
      // Persistence loss must not trigger a second wallet call.
    }
    return rejected ? { kind: 'rejected' } : { kind: 'unknown' };
  }

  const submitted: JournalEntry = {
    ...awaitingWallet,
    updatedAt: new Date().toISOString(),
    originalTxHash: hash,
    currentTxHash: hash,
    evidenceSource: 'WALLET_RETURNED',
    association: 'EXACT_SUBMISSION',
    status: 'SUBMITTED',
  };
  try {
    journal.save(submitted);
  } catch {
    return { kind: 'unknown', hash };
  }

  try {
    const nonce = await action.readNonce(hash);
    journal.save({ ...submitted, updatedAt: new Date().toISOString(), nonce });
  } catch {
    // Optional enrichment cannot erase the already durable hash.
  }
  return { kind: 'submitted', hash };
}
