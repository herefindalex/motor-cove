export type {
  EventRecord,
  FundingMatchedEvent,
  FundingObservationRecord,
  FundingObservationSelector,
  ProjectionProvenance,
  ReadModelReader,
  ReadSnapshot,
  SaleRecord,
  SystemRecord,
  VehicleRecord,
} from './types.js';
export { createReadOnlyReader } from './sales-reader.js';
export type { ReadObservationHooks } from './sales-reader.js';
