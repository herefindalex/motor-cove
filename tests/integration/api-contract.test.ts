import { afterAll, describe, expect, it, vi } from 'vitest';
import type { ReadModelReader } from '../../packages/database/src/reader/index.js';
import { publicConfigSchema, uint256Max } from '../../packages/api-contracts/src/index.js';
import { createOpenApiDocument } from '../../packages/api-contracts/src/openapi.js';
import { createApp } from '../../apps/api/src/app/create-app.js';

const deploymentId = `0x${'1'.repeat(64)}`;
const blockHash = `0x${'2'.repeat(64)}`;
const seller = `0x${'3'.repeat(40)}`;
const provenance = {
  deploymentId,
  indexedBlockNumber: '7',
  indexedBlockHash: blockHash,
  projectorVersion: '2',
  projectionBuildId: 'integration-test',
  logScopeHash: `0x${'6'.repeat(64)}`,
};
const sale = {
  saleId: '1',
  tokenId: '1',
  seller,
  allowedBuyer: seller,
  buyer: null,
  priceWei: '1000000000000000000',
  fundedAt: null,
  expiresAt: null,
  status: 'LISTED',
  tokenReclaimed: false,
  metadataStatus: 'AVAILABLE' as const,
  catalogId: 'apex-gt',
  claim: null,
};
const snapshot = <T>(data: T) => ({ data, provenance });

const reader: ReadModelReader = {
  deploymentDescriptor: () => ({
    deploymentId,
    chainId: '31337',
    nftAddress: `0x${'4'.repeat(40)}`,
    escrowAddress: `0x${'5'.repeat(40)}`,
    protocolVersion: '0.1.0',
    abiBundleHash: `0x${'6'.repeat(64)}`,
    scanStartBlock: 1,
    nftDeploymentBlock: 1,
    nftDeploymentHash: blockHash,
    nftRuntimeCodeHash: `0x${'7'.repeat(64)}`,
    escrowDeploymentBlock: 2,
    escrowDeploymentHash: blockHash,
    escrowRuntimeCodeHash: `0x${'8'.repeat(64)}`,
    manifestHash: `0x${'9'.repeat(64)}`,
    manifestJson: '{}',
  }),
  listSales: () => snapshot([sale]),
  getSale: (saleId) => snapshot(saleId === '1' ? sale : null),
  observeFunding: (saleId, selector) =>
    snapshot({
      sale: saleId === '1' ? { ...sale, status: 'FUNDED' as const, buyer: seller } : null,
      freshness: {
        projectionStatus: 'CURRENT',
        observationFreshness: 'FRESH',
        observationAgeSeconds: '1',
        lastObservedHead: '7',
        lastEligibleHead: '7',
        lastHeadAdvancedAt: '2026-09-21T00:00:00.000Z',
        lagBlocks: '0',
        lastObservedAt: '2026-09-21T00:00:00.000Z',
        lastRpcSuccessAt: '2026-09-21T00:00:00.000Z',
        workerHeartbeatAt: '2026-09-21T00:00:00.000Z',
        recoveryReason: null,
      },
      observation: {
        requestEcho: selector,
        coverage: 'SCANNED' as const,
        observedHeaderAtRequestedHeight: {
          blockNumber: selector.blockNumber,
          blockHash: selector.blockHash,
          canonical: true,
          scanComplete: true,
        },
        eventLookup: 'MATCHED' as const,
        matchedEvent: {
          ...selector,
          emitter: config.escrowAddress,
          saleId,
          buyer: seller,
          amountWei: sale.priceWei,
          fundedAt: '1',
          expiresAt: '301',
        },
        projectionEffect: 'CONSISTENT' as const,
      },
    }),
  listVehicles: () =>
    snapshot([
      {
        catalogId: 'apex-gt',
        tokenId: '1',
        name: 'Apex GT',
        description: 'Local collectible',
        imagePath: '/vehicles/apex-gt.svg',
        currentOwner: seller,
        metadataStatus: 'AVAILABLE',
      },
    ]),
  systemStatus: () =>
    snapshot({
      projectionStatus: 'CURRENT',
      observationFreshness: 'FRESH',
      observationAgeSeconds: '1',
      lastObservedHead: '7',
      lastEligibleHead: '7',
      lastHeadAdvancedAt: '2026-09-21T00:00:00.000Z',
      lagBlocks: '0',
      lastObservedAt: '2026-09-21T00:00:00.000Z',
      lastRpcSuccessAt: '2026-09-21T00:00:00.000Z',
      workerHeartbeatAt: '2026-09-21T00:00:00.000Z',
      recoveryReason: null,
    }),
  recentEvents: () =>
    snapshot([
      {
        blockNumber: '7',
        blockHash,
        transactionHash: `0x${'8'.repeat(64)}`,
        logIndex: 0,
        canonical: false,
        scanComplete: true,
        sourceLogScopeHash: provenance.logScopeHash,
        eventName: 'SaleFunded',
        decoded: { kind: 'SaleFunded' },
      },
    ]),
  latestReconciliation: () => snapshot(null),
  close: async () => {},
};

const config = publicConfigSchema.parse({
  deploymentId,
  chainId: '31337',
  protocolVersion: '0.1.0',
  nftAddress: `0x${'4'.repeat(40)}`,
  escrowAddress: `0x${'5'.repeat(40)}`,
  fundingPeriodSeconds: '300',
});
const app = await createApp(reader, config);
afterAll(async () => app.close());

describe('API wire contracts', () => {
  it.each([
    '/v1/config',
    '/v1/vehicles',
    '/v1/sales',
    '/v1/sales/1',
    '/v1/system/status',
    '/v1/system/events',
    '/v1/system/reconciliation',
  ])('returns a schema-compatible response for %s', async (path) => {
    const response = await app.inject({ method: 'GET', url: path });
    expect(response.statusCode).toBe(200);
    expect(() => {
      void response.json();
    }).not.toThrow();
  });

  it('returns event-level canonical and source-scan evidence', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/system/events' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [
        {
          canonical: false,
          scanComplete: true,
          sourceLogScopeHash: provenance.logScopeHash,
        },
      ],
    });
  });

  it('returns stable errors for invalid and missing sale IDs', async () => {
    const invalid = await app.inject({ method: 'GET', url: '/v1/sales/not-a-number' });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ error: { code: 'INVALID_SALE_ID' } });

    const missing = await app.inject({ method: 'GET', url: '/v1/sales/999' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: { code: 'SALE_NOT_FOUND' } });

    const maximumMissing = await app.inject({
      method: 'GET',
      url: `/v1/sales/${uint256Max}`,
    });
    expect(maximumMissing.statusCode).toBe(404);

    const overflow = await app.inject({
      method: 'GET',
      url: `/v1/sales/${uint256Max + 1n}`,
    });
    expect(overflow.statusCode).toBe(400);
    expect(overflow.json()).toMatchObject({ error: { code: 'INVALID_SALE_ID' } });
  });

  it('keeps internal reader failures as 500 errors', async () => {
    const failingReader: ReadModelReader = {
      ...reader,
      getSale: vi.fn(() => {
        throw new Error('DATABASE_INTEGRITY_FAILURE');
      }),
    };
    const failingApp = await createApp(failingReader, config);
    const response = await failingApp.inject({ method: 'GET', url: '/v1/sales/1' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
    await failingApp.close();
  });

  it('validates and returns a selector-scoped funding observation', async () => {
    const query = new URLSearchParams({
      deploymentId,
      observeTxHash: `0x${'7'.repeat(64)}`,
      observeBlockNumber: '7',
      observeBlockHash: blockHash,
      observeLogIndex: '2',
    });
    const matched = await app.inject({ method: 'GET', url: `/v1/sales/1?${query}` });
    expect(matched.statusCode).toBe(200);
    expect(matched.json()).toMatchObject({
      data: {
        observation: {
          coverage: 'SCANNED',
          eventLookup: 'MATCHED',
          projectionEffect: 'CONSISTENT',
        },
      },
    });

    const partial = await app.inject({
      method: 'GET',
      url: `/v1/sales/1?deploymentId=${deploymentId}`,
    });
    expect(partial.statusCode).toBe(400);
    expect(partial.json()).toMatchObject({ error: { code: 'INVALID_OBSERVATION_SELECTOR' } });

    query.set('observeBlockNumber', String(Number.MAX_SAFE_INTEGER + 1));
    const unsafeBlock = await app.inject({ method: 'GET', url: `/v1/sales/1?${query}` });
    expect(unsafeBlock.statusCode).toBe(400);
    expect(unsafeBlock.json()).toMatchObject({
      error: { code: 'INVALID_OBSERVATION_SELECTOR' },
    });
    query.set('observeBlockNumber', 'not-a-number');
    const malformedBlock = await app.inject({
      method: 'GET',
      url: `/v1/sales/1?${query}`,
    });
    expect(malformedBlock.statusCode).toBe(400);
    expect(malformedBlock.json()).toMatchObject({
      error: { code: 'INVALID_OBSERVATION_SELECTOR' },
    });
    query.set('observeBlockNumber', '7');

    query.set('deploymentId', `0x${'9'.repeat(64)}`);
    const wrongDeployment = await app.inject({ method: 'GET', url: `/v1/sales/1?${query}` });
    expect(wrongDeployment.statusCode).toBe(409);
    expect(wrongDeployment.json()).toMatchObject({ error: { code: 'DEPLOYMENT_MISMATCH' } });
  });

  it('documents every public route in generated OpenAPI', () => {
    const paths = createOpenApiDocument().paths as Record<string, unknown>;
    expect(Object.keys(paths).sort()).toEqual(
      [
        '/health/live',
        '/health/ready',
        '/v1/config',
        '/v1/sales',
        '/v1/sales/{saleId}',
        '/v1/system/events',
        '/v1/system/reconciliation',
        '/v1/system/status',
        '/v1/vehicles',
      ].sort(),
    );
  });
});
