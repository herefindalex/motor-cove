import {
  fundingObservationResponseSchema,
  publicConfigSchema,
  responseEnvelope,
  saleSchema,
  systemStatusSchema,
  vehicleSchema,
  type FundingObservationQuery,
  type FundingObservationResponse,
  type PublicConfig,
  type SaleResponse,
  type SystemStatus,
  type VehicleResponse,
} from '@motorcove/api-contracts';

const environment = import.meta.env as unknown as Readonly<
  Record<string, string | boolean | undefined>
>;
const configuredApiUrl = environment['VITE_MOTORCOVE_API_URL'];
const baseUrl = typeof configuredApiUrl === 'string' ? configuredApiUrl : 'http://127.0.0.1:3001';

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) throw new Error(`API_${response.status}`);
  return JSON.parse(await response.text()) as unknown;
}

export interface ApiSnapshot<T> {
  readonly data: T;
  readonly provenance: {
    deploymentId: string;
    indexedBlockNumber: string;
    indexedBlockHash: string;
    projectorVersion: string;
    projectionBuildId: string;
    logScopeHash: string;
  };
}

export const motorCoveApi = {
  config: async (): Promise<PublicConfig> => publicConfigSchema.parse(await getJson('/v1/config')),
  sales: async (): Promise<ApiSnapshot<readonly SaleResponse[]>> =>
    responseEnvelope(saleSchema.array()).parse(await getJson('/v1/sales')),
  sale: async (saleId: string): Promise<ApiSnapshot<SaleResponse>> =>
    responseEnvelope(saleSchema).parse(await getJson(`/v1/sales/${encodeURIComponent(saleId)}`)),
  fundingObservation: async (
    saleId: string,
    query: FundingObservationQuery,
  ): Promise<FundingObservationResponse> => {
    const params = new URLSearchParams({
      deploymentId: query.deploymentId,
      observeTxHash: query.observeTxHash,
      observeBlockNumber: query.observeBlockNumber,
      observeBlockHash: query.observeBlockHash,
      observeLogIndex: String(query.observeLogIndex),
    });
    return fundingObservationResponseSchema.parse(
      await getJson(`/v1/sales/${encodeURIComponent(saleId)}?${params.toString()}`),
    );
  },
  vehicles: async (): Promise<ApiSnapshot<readonly VehicleResponse[]>> =>
    responseEnvelope(vehicleSchema.array()).parse(await getJson('/v1/vehicles')),
  system: async (): Promise<ApiSnapshot<SystemStatus>> =>
    responseEnvelope(systemStatusSchema).parse(await getJson('/v1/system/status')),
};
