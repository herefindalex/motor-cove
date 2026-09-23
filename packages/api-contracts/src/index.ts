import { z } from 'zod';

export const decimalString = z.string().regex(/^(0|[1-9]\d*)$/);
export const uint256Max = (1n << 256n) - 1n;
export const uint256DecimalString = z
  .string()
  .refine(
    (value) => /^(0|[1-9]\d*)$/.test(value) && BigInt(value) <= uint256Max,
    'Value must be a canonical decimal uint256',
  );
export const safeBlockNumberString = uint256DecimalString.refine(
  (value) => /^(0|[1-9]\d*)$/.test(value) && BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER),
  'Block number exceeds the supported safe integer range',
);
export const hexAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

export const saleStatusSchema = z.enum(['LISTED', 'FUNDED', 'COMPLETED', 'CANCELLED', 'EXPIRED']);
export const paymentStatusSchema = z.enum(['NONE', 'CLAIMABLE', 'WITHDRAWN']);
export const projectionStatusSchema = z.enum([
  'UNINITIALIZED',
  'SYNCING',
  'CURRENT',
  'STALE',
  'REBUILD_REQUIRED',
  'REBUILDING',
  'RECOVERY_REQUIRED',
]);

export const provenanceSchema = z.object({
  deploymentId: bytes32,
  indexedBlockNumber: decimalString,
  indexedBlockHash: bytes32,
  projectorVersion: decimalString,
  projectionBuildId: z.string().min(1),
  logScopeHash: bytes32,
});

export const vehicleSchema = z.object({
  catalogId: z.string().min(1),
  tokenId: decimalString.nullable(),
  name: z.string(),
  description: z.string(),
  imagePath: z.string(),
  currentOwner: hexAddress.nullable(),
  metadataStatus: z.literal('AVAILABLE'),
});

export const paymentClaimSchema = z.object({
  kind: z.enum(['SELLER_PROCEEDS', 'BUYER_REFUND']),
  status: paymentStatusSchema,
  beneficiary: hexAddress,
  amountWei: decimalString,
});

export const saleSchema = z.object({
  saleId: decimalString,
  tokenId: decimalString,
  seller: hexAddress,
  allowedBuyer: hexAddress.nullable(),
  buyer: hexAddress.nullable(),
  priceWei: decimalString,
  fundedAt: decimalString.nullable(),
  expiresAt: decimalString.nullable(),
  status: saleStatusSchema,
  tokenReclaimed: z.boolean(),
  metadataStatus: z.enum(['AVAILABLE', 'MISSING']),
  catalogId: z.string().nullable(),
  claim: paymentClaimSchema.nullable(),
});

export const responseEnvelope = <T extends z.ZodType>(data: T) =>
  z.object({ data, provenance: provenanceSchema });

export const systemStatusSchema = z.object({
  projectionStatus: projectionStatusSchema,
  observationFreshness: z.enum(['FRESH', 'STALE', 'UNKNOWN']),
  observationAgeSeconds: decimalString.nullable(),
  lastObservedHead: decimalString.nullable(),
  lastEligibleHead: decimalString.nullable(),
  lastHeadAdvancedAt: z.string().nullable(),
  lagBlocks: decimalString.nullable(),
  lastObservedAt: z.string().nullable(),
  lastRpcSuccessAt: z.string().nullable(),
  workerHeartbeatAt: z.string().nullable(),
  recoveryReason: z.string().nullable(),
});

export const systemEventSchema = z.object({
  blockNumber: decimalString,
  blockHash: bytes32,
  transactionHash: bytes32,
  logIndex: z.number().int().nonnegative(),
  canonical: z.boolean(),
  scanComplete: z.boolean(),
  sourceLogScopeHash: bytes32,
  eventName: z.string(),
  decoded: z.unknown(),
});

export const reconciliationSchema = z
  .object({
    comparison: z.enum(['MATCH', 'MISMATCH', 'UNVERIFIABLE']),
    freshness: z.enum(['CURRENT', 'PROJECTION_LAGGING', 'HEAD_UNKNOWN']),
    blockNumber: decimalString.nullable(),
    blockHash: bytes32.nullable(),
    projectorVersion: decimalString,
    projectionBuildId: z.string().min(1),
    logScopeHash: bytes32,
    scope: z.unknown(),
    differences: z.array(z.unknown()),
    createdAt: z.string(),
  })
  .nullable();

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

export const publicConfigSchema = z.object({
  deploymentId: bytes32,
  chainId: decimalString,
  protocolVersion: z.string(),
  nftAddress: hexAddress,
  escrowAddress: hexAddress,
  fundingPeriodSeconds: decimalString,
});

export const errorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), requestId: z.string() }),
});

export type SaleResponse = z.infer<typeof saleSchema>;
export type VehicleResponse = z.infer<typeof vehicleSchema>;
export type PublicConfig = z.infer<typeof publicConfigSchema>;
export type SystemStatus = z.infer<typeof systemStatusSchema>;

export const fundingObservationQuerySchema = z.object({
  deploymentId: bytes32,
  observeTxHash: bytes32,
  observeBlockNumber: safeBlockNumberString,
  observeBlockHash: bytes32,
  observeLogIndex: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

export const fundingMatchedEventSchema = z.object({
  transactionHash: bytes32,
  blockNumber: decimalString,
  blockHash: bytes32,
  logIndex: z.number().int().nonnegative(),
  emitter: hexAddress,
  saleId: decimalString,
  buyer: hexAddress,
  amountWei: decimalString,
  fundedAt: decimalString,
  expiresAt: decimalString,
});

export const fundingObservationSchema = z.object({
  requestEcho: z.object({
    transactionHash: bytes32,
    blockNumber: decimalString,
    blockHash: bytes32,
    logIndex: z.number().int().nonnegative(),
  }),
  coverage: z.enum(['NOT_REACHED', 'SCANNED', 'UNVERIFIABLE']),
  observedHeaderAtRequestedHeight: z
    .object({
      blockNumber: decimalString,
      blockHash: bytes32,
      canonical: z.boolean(),
      scanComplete: z.boolean(),
    })
    .nullable(),
  eventLookup: z.enum(['NOT_FOUND', 'MATCHED', 'NONCANONICAL', 'SELECTOR_MISMATCH']),
  matchedEvent: fundingMatchedEventSchema.nullable(),
  projectionEffect: z.enum(['NOT_ASSESSED', 'CONSISTENT', 'INCONSISTENT']),
});

export const fundingObservationResponseSchema = z.object({
  data: z.object({
    sale: saleSchema.nullable(),
    freshness: systemStatusSchema,
    observation: fundingObservationSchema,
  }),
  provenance: provenanceSchema,
});

export type FundingObservationQuery = z.infer<typeof fundingObservationQuerySchema>;
export type FundingObservationResponse = z.infer<typeof fundingObservationResponseSchema>;
