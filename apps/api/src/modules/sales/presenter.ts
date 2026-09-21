import {
  fundingObservationResponseSchema,
  responseEnvelope,
  saleSchema,
} from '@motorcove/api-contracts';

export const presentSales = (value: unknown) => responseEnvelope(saleSchema.array()).parse(value);
export const presentSale = (value: unknown) => responseEnvelope(saleSchema).parse(value);
export const presentFundingObservation = (value: unknown) =>
  fundingObservationResponseSchema.parse(value);
