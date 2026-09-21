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
  readonly lastObservedHead: string | null;
  readonly lagBlocks: string | null;
  readonly lastObservedAt: string | null;
  readonly lastRpcSuccessAt: string | null;
  readonly workerHeartbeatAt: string | null;
  readonly recoveryReason: string | null;
}
export interface EventRecord {
  readonly blockNumber: string;
  readonly blockHash: string;
  readonly transactionHash: string;
  readonly logIndex: number;
  readonly eventName: string;
  readonly decoded: unknown;
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
  listSales(): ReadSnapshot<readonly SaleRecord[]>;
  getSale(saleId: string): ReadSnapshot<SaleRecord | null>;
  observeFunding(
    saleId: string,
    selector: FundingObservationSelector,
  ): ReadSnapshot<FundingObservationRecord>;
  listVehicles(): ReadSnapshot<readonly VehicleRecord[]>;
  systemStatus(): ReadSnapshot<SystemRecord>;
  recentEvents(limit?: number): ReadSnapshot<readonly EventRecord[]>;
  latestReconciliation(): ReadSnapshot<unknown>;
  close(): Promise<void>;
}
