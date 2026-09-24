export type {
  EventRecord,
  DeploymentDescriptor,
  FundingMatchedEvent,
  FundingObservationRecord,
  FundingObservationSelector,
  ProjectionProvenance,
  ReadModelReader,
  ReconciliationRecord,
  ReadSnapshot,
  SaleRecord,
  SystemRecord,
  SourceAuditBlock,
  SourceAuditEvent,
  VehicleRecord,
} from './types.js';
export { createReadOnlyReader } from './sales-reader.js';
export {
  DEFAULT_WORKER_HEARTBEAT_STALE_AFTER_MS,
  type ReadObservationHooks,
} from './sales-reader.js';
