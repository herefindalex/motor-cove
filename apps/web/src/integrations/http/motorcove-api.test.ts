import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { motorCoveApi } from './motorcove-api.js';

const deploymentA = `0x${'1'.repeat(64)}`;
const deploymentB = `0x${'2'.repeat(64)}`;
const provenance = {
  deploymentId: deploymentB,
  indexedBlockNumber: '7',
  indexedBlockHash: `0x${'3'.repeat(64)}`,
  projectorVersion: '2',
  projectionBuildId: 'api-test',
  logScopeHash: `0x${'4'.repeat(64)}`,
};

afterEach(() => vi.unstubAllGlobals());

function respond(data: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ data, provenance }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
}

describe('MotorCove API deployment provenance', () => {
  it.each([
    ['sales', () => motorCoveApi.sales(deploymentA), []],
    ['vehicles', () => motorCoveApi.vehicles(deploymentA), []],
    [
      'sale',
      () => motorCoveApi.sale('1', deploymentA),
      {
        saleId: '1',
        tokenId: '1',
        seller: `0x${'5'.repeat(40)}`,
        buyer: null,
        priceWei: '1',
        fundedAt: null,
        expiresAt: null,
        status: 'LISTED',
        tokenReclaimed: false,
        metadataStatus: 'AVAILABLE',
        catalogId: 'apex-gt',
        claim: null,
      },
    ],
    [
      'system',
      () => motorCoveApi.system(deploymentA),
      {
        projectionStatus: 'CURRENT',
        observationFreshness: 'FRESH',
        observationAgeSeconds: '0',
        lastObservedHead: '7',
        lagBlocks: '0',
        lastObservedAt: '2026-09-22T00:00:00.000Z',
        lastRpcSuccessAt: '2026-09-22T00:00:00.000Z',
        workerHeartbeatAt: '2026-09-22T00:00:00.000Z',
        recoveryReason: null,
      },
    ],
  ])('rejects %s data from a different deployment', async (_name, request, data) => {
    respond(data);
    await expect(request()).rejects.toThrow('API_DEPLOYMENT_MISMATCH');
  });

  it('accepts equivalent case-insensitive deployment provenance', async () => {
    const mixedCase = `0x${'aB'.repeat(32)}`;
    respond([]);
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [],
          provenance: { ...provenance, deploymentId: mixedCase },
        }),
        { status: 200 },
      ),
    );

    await expect(motorCoveApi.sales(mixedCase.toLowerCase())).resolves.toMatchObject({ data: [] });
  });

  it('does not cache mismatched data and recovers under the replacement deployment key', async () => {
    respond([]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await expect(
      queryClient.fetchQuery({
        queryKey: ['sales', deploymentA],
        queryFn: () => motorCoveApi.sales(deploymentA),
      }),
    ).rejects.toThrow('API_DEPLOYMENT_MISMATCH');
    expect(queryClient.getQueryData(['sales', deploymentA])).toBeUndefined();

    await expect(
      queryClient.fetchQuery({
        queryKey: ['sales', deploymentB],
        queryFn: () => motorCoveApi.sales(deploymentB),
      }),
    ).resolves.toMatchObject({ data: [], provenance: { deploymentId: deploymentB } });
    expect(queryClient.getQueryData(['sales', deploymentB])).toMatchObject({
      provenance: { deploymentId: deploymentB },
    });
    queryClient.clear();
  });
});
