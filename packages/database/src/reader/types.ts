import type { ProjectionProvenance } from '../types/index.js';

export type { ProjectionProvenance };
export interface ReadSnapshot<T> {
  readonly data: T;
  readonly provenance: ProjectionProvenance;
}
export interface SaleRecord {
  readonly saleId: string;
  readonly tokenId: string;
  readonly seller: string;
  readonly buyer: string | null;
  readonly priceWei: string;
  readonly fundedAt: string | null;
  readonly expiresAt: string | null;
  readonly status: string;
  readonly tokenReclaimed: boolean;
  readonly metadataStatus: 'AVAILABLE' | 'MISSING';
  readonly catalogId: string | null;
  readonly claim: null | {
    readonly beneficiary: string;
    readonly amountWei: string;
    readonly kind: string;
    readonly status: string;
  };
}
export interface VehicleRecord {
  readonly catalogId: string;
  readonly tokenId: string | null;
  readonly name: string;
  readonly description: string;
  readonly imagePath: string;
  readonly currentOwner: string | null;
  readonly metadataStatus: 'AVAILABLE';
}
export interface SystemRecord {
  readonly projectionStatus: string;
  readonly observationFreshness: 'FRESH' | 'STALE' | 'UNKNOWN';
  readonly observationAgeSeconds: string | null;
  readonly lastObservedHead: string | null;
  readonly lagBlocks: string | null;
  readonly lastObservedAt: string | null;
  readonly lastRpcSuccessAt: string | null;
  readonly workerHeartbeatAt: string | null;
  readonly recoveryReason: string | null;
}

export interface ReconciliationRecord {
  readonly comparison: 'MATCH' | 'MISMATCH' | 'UNVERIFIABLE';
  readonly freshness: 'CURRENT' | 'PROJECTION_LAGGING' | 'HEAD_UNKNOWN';
  readonly blockNumber: string | null;
  readonly blockHash: string | null;
  readonly projectorVersion: string;
  readonly projectionBuildId: string;
  readonly logScopeHash: string;
  readonly scope: unknown;
  readonly differences: unknown;
  readonly createdAt: string;
}
export interface EventRecord {
  readonly blockNumber: string;
  readonly blockHash: string;
  readonly transactionHash: string;
  readonly logIndex: number;
  readonly eventName: string;
  readonly decoded: unknown;
}

export interface DeploymentDescriptor {
  readonly deploymentId: string;
  readonly chainId: string;
  readonly nftAddress: string;
  readonly escrowAddress: string;
  readonly protocolVersion: string;
  readonly abiBundleHash: string;
  readonly scanStartBlock: number;
  readonly nftDeploymentBlock: number;
  readonly nftDeploymentHash: string;
  readonly nftRuntimeCodeHash: string;
  readonly escrowDeploymentBlock: number;
  readonly escrowDeploymentHash: string;
  readonly escrowRuntimeCodeHash: string;
  readonly manifestHash: string;
  readonly manifestJson: string;
}

export interface FundingObservationSelector {
  readonly transactionHash: string;
  readonly blockNumber: string;
  readonly blockHash: string;
  readonly logIndex: number;
}

export interface FundingMatchedEvent {
  readonly transactionHash: string;
  readonly blockNumber: string;
  readonly blockHash: string;
  readonly logIndex: number;
  readonly emitter: string;
  readonly saleId: string;
  readonly buyer: string;
  readonly amountWei: string;
  readonly fundedAt: string;
  readonly expiresAt: string;
}

export interface FundingObservationRecord {
  readonly sale: SaleRecord | null;
  readonly freshness: SystemRecord;
  readonly observation: {
    readonly requestEcho: FundingObservationSelector;
    readonly coverage: 'NOT_REACHED' | 'SCANNED' | 'UNVERIFIABLE';
    readonly observedHeaderAtRequestedHeight: null | {
      readonly blockNumber: string;
      readonly blockHash: string;
      readonly canonical: boolean;
      readonly scanComplete: boolean;
    };
    readonly eventLookup: 'NOT_FOUND' | 'MATCHED' | 'NONCANONICAL' | 'SELECTOR_MISMATCH';
    readonly matchedEvent: FundingMatchedEvent | null;
    readonly projectionEffect: 'NOT_ASSESSED' | 'CONSISTENT' | 'INCONSISTENT';
  };
}
export interface ReadModelReader {
  deploymentDescriptor(): DeploymentDescriptor;
  listSales(): ReadSnapshot<readonly SaleRecord[]>;
  getSale(saleId: string): ReadSnapshot<SaleRecord | null>;
  observeFunding(
    saleId: string,
    selector: FundingObservationSelector,
  ): ReadSnapshot<FundingObservationRecord>;
  listVehicles(): ReadSnapshot<readonly VehicleRecord[]>;
  systemStatus(): ReadSnapshot<SystemRecord>;
  recentEvents(limit?: number): ReadSnapshot<readonly EventRecord[]>;
  latestReconciliation(): ReadSnapshot<ReconciliationRecord | null>;
  close(): Promise<void>;
}
