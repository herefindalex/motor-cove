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

function assertDeployment<T>(
  snapshot: ApiSnapshot<T>,
  expectedDeploymentId: string,
): ApiSnapshot<T> {
  if (snapshot.provenance.deploymentId.toLowerCase() !== expectedDeploymentId.toLowerCase())
    throw new Error(
      `API_DEPLOYMENT_MISMATCH: expected ${expectedDeploymentId}, got ${snapshot.provenance.deploymentId}`,
    );
  return snapshot;
}

export const motorCoveApi = {
  config: async (): Promise<PublicConfig> => publicConfigSchema.parse(await getJson('/v1/config')),
  sales: async (expectedDeploymentId: string): Promise<ApiSnapshot<readonly SaleResponse[]>> =>
    assertDeployment(
      responseEnvelope(saleSchema.array()).parse(await getJson('/v1/sales')),
      expectedDeploymentId,
    ),
  sale: async (saleId: string, expectedDeploymentId: string): Promise<ApiSnapshot<SaleResponse>> =>
    assertDeployment(
      responseEnvelope(saleSchema).parse(await getJson(`/v1/sales/${encodeURIComponent(saleId)}`)),
      expectedDeploymentId,
    ),
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
  vehicles: async (
    expectedDeploymentId: string,
  ): Promise<ApiSnapshot<readonly VehicleResponse[]>> =>
    assertDeployment(
      responseEnvelope(vehicleSchema.array()).parse(await getJson('/v1/vehicles')),
      expectedDeploymentId,
    ),
  system: async (expectedDeploymentId: string): Promise<ApiSnapshot<SystemStatus>> =>
    assertDeployment(
      responseEnvelope(systemStatusSchema).parse(await getJson('/v1/system/status')),
      expectedDeploymentId,
    ),
};
