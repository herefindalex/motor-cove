import { z } from 'zod';

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const bytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const unsignedIntegerSchema = z.string().regex(/^(0|[1-9]\d*)$/);

export const transactionObservationSchema = z.enum([
  'IDLE',
  'PREPARING',
  'AWAITING_WALLET',
  'REJECTED',
  'FAILED_BEFORE_SUBMIT',
  'SUBMITTED',
  'INCLUDED_SUCCESS',
  'INCLUDED_REVERTED',
  'UNKNOWN',
  'REPLACED_OR_CANCELLED',
  'ORPHANED',
]);

export type TransactionObservation = z.infer<typeof transactionObservationSchema>;

export const journalEntrySchema = z.object({
  schemaVersion: z.literal(1),
  clientOperationId: z.string().min(1),
  retryOf: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deploymentId: bytes32Schema,
  chainId: z.number().int().nonnegative(),
  account: addressSchema,
  protocolVersion: z.string().min(1),
  action: z.string().min(1),
  saleId: unsignedIntegerSchema.optional(),
  tokenId: unsignedIntegerSchema.optional(),
  intendedContract: addressSchema,
  intendedCalldata: z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/),
  calldataSummary: z.string().min(1),
  valueWei: unsignedIntegerSchema,
  walletRequestStartedAt: z.string().datetime().optional(),
  originalTxHash: bytes32Schema.optional(),
  currentTxHash: bytes32Schema.optional(),
  nonce: z.number().int().nonnegative().optional(),
  receiptStatus: z.enum(['SUCCESS', 'REVERTED']).optional(),
  receiptBlockNumber: unsignedIntegerSchema.optional(),
  receiptBlockHash: bytes32Schema.optional(),
  eventLogIndex: z.number().int().nonnegative().optional(),
  eventBuyer: addressSchema.optional(),
  eventAmountWei: unsignedIntegerSchema.optional(),
  evidenceSource: z.enum(['WALLET_RETURNED', 'USER_SUPPLIED']).optional(),
  association: z.enum(['EXACT_SUBMISSION', 'INTENT_MATCH']).optional(),
  replacementKind: z.enum(['REPRICED', 'CANCELLED', 'DIFFERENT_CALL']).optional(),
  lastVerifiedAt: z.string().datetime().optional(),
  verificationRequestId: z.string().min(1).optional(),
  verificationAvailability: z.enum(['VERIFYING', 'AVAILABLE', 'UNAVAILABLE']).optional(),
  projectionObservation: z
    .enum(['NOT_REACHED', 'REFLECTED', 'INCONSISTENT', 'UNVERIFIABLE'])
    .optional(),
  projectionTransactionHash: bytes32Schema.optional(),
  projectionBlockHash: bytes32Schema.optional(),
  projectionLogIndex: z.number().int().nonnegative().optional(),
  projectionDeploymentId: bytes32Schema.optional(),
  projectionBuildId: z.string().min(1).optional(),
  status: transactionObservationSchema,
  lastErrorCategory: z.string().min(1).optional(),
});

export type JournalEntry = z.infer<typeof journalEntrySchema>;

export function isProjectionCurrentlyReflected(entry: JournalEntry): boolean {
  return (
    entry.status === 'INCLUDED_SUCCESS' &&
    entry.receiptStatus === 'SUCCESS' &&
    entry.projectionObservation === 'REFLECTED' &&
    entry.projectionTransactionHash === entry.currentTxHash &&
    entry.projectionBlockHash === entry.receiptBlockHash &&
    entry.projectionLogIndex === entry.eventLogIndex &&
    entry.projectionDeploymentId === entry.deploymentId &&
    Boolean(entry.projectionBuildId)
  );
}

export type SubmissionResult =
  | { kind: 'submitted'; hash: `0x${string}`; clientOperationId: string }
  | {
      kind: 'submitted-non-durable';
      hash: `0x${string}`;
      clientOperationId: string;
    }
  | { kind: 'rejected'; clientOperationId: string }
  | { kind: 'failed'; message: string; clientOperationId: string }
  | { kind: 'unknown'; clientOperationId: string };
