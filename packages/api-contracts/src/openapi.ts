import { z } from 'zod';
import {
  apiErrorSchema,
  fundingObservationResponseSchema,
  publicConfigSchema,
  reconciliationSchema,
  responseEnvelope,
  saleSchema,
  systemEventSchema,
  systemStatusSchema,
  vehicleSchema,
} from './index.js';

const response = (description: string, schema?: string) => ({
  description,
  ...(schema
    ? {
        content: {
          'application/json': { schema: { $ref: `#/components/schemas/${schema}` } },
        },
      }
    : {}),
});

const readErrors = {
  '503': response('Read model unavailable', 'ApiError'),
  '500': response('Internal error', 'ApiError'),
};

export function createOpenApiDocument(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: { title: 'MotorCove read API', version: '0.1.0' },
    paths: {
      '/health/live': { get: { responses: { '200': response('Process is live') } } },
      '/health/ready': {
        get: {
          responses: {
            '200': response('Read model is ready'),
            '503': response('Read model is not ready'),
          },
        },
      },
      '/v1/config': {
        get: { responses: { '200': response('Public deployment config', 'PublicConfig') } },
      },
      '/v1/vehicles': {
        get: {
          responses: { '200': response('Vehicle catalog', 'VehiclesEnvelope'), ...readErrors },
        },
      },
      '/v1/sales': {
        get: { responses: { '200': response('Projected sales', 'SalesEnvelope'), ...readErrors } },
      },
      '/v1/sales/{saleId}': {
        get: {
          parameters: [
            {
              name: 'saleId',
              in: 'path',
              required: true,
              schema: { type: 'string', pattern: '^(0|[1-9]\\d*)$' },
            },
            {
              name: 'deploymentId',
              in: 'query',
              required: false,
              schema: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$' },
            },
            {
              name: 'observeTxHash',
              in: 'query',
              required: false,
              schema: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$' },
            },
            {
              name: 'observeBlockNumber',
              in: 'query',
              required: false,
              schema: { type: 'string', pattern: '^(0|[1-9]\\d*)$' },
            },
            {
              name: 'observeBlockHash',
              in: 'query',
              required: false,
              schema: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$' },
            },
            {
              name: 'observeLogIndex',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 0 },
            },
          ],
          responses: {
            '200': {
              description: 'Projected sale or selector-scoped funding observation',
              content: {
                'application/json': {
                  schema: {
                    oneOf: [
                      { $ref: '#/components/schemas/SaleEnvelope' },
                      { $ref: '#/components/schemas/FundingObservationEnvelope' },
                    ],
                  },
                },
              },
            },
            '409': response('Deployment mismatch', 'ApiError'),
            '404': response('Sale not found', 'ApiError'),
            ...readErrors,
          },
        },
      },
      '/v1/system/status': {
        get: {
          responses: { '200': response('Indexer status', 'SystemStatusEnvelope'), ...readErrors },
        },
      },
      '/v1/system/events': {
        get: {
          responses: {
            '200': response('Recent canonical events', 'EventsEnvelope'),
            ...readErrors,
          },
        },
      },
      '/v1/system/reconciliation': {
        get: {
          responses: {
            '200': response('Latest reconciliation result', 'ReconciliationEnvelope'),
            ...readErrors,
          },
        },
      },
    },
    components: {
      schemas: {
        PublicConfig: z.toJSONSchema(publicConfigSchema),
        Sale: z.toJSONSchema(saleSchema),
        SaleEnvelope: z.toJSONSchema(responseEnvelope(saleSchema)),
        FundingObservationEnvelope: z.toJSONSchema(fundingObservationResponseSchema),
        SalesEnvelope: z.toJSONSchema(responseEnvelope(saleSchema.array())),
        Vehicle: z.toJSONSchema(vehicleSchema),
        VehiclesEnvelope: z.toJSONSchema(responseEnvelope(vehicleSchema.array())),
        SystemStatusEnvelope: z.toJSONSchema(responseEnvelope(systemStatusSchema)),
        EventsEnvelope: z.toJSONSchema(responseEnvelope(systemEventSchema.array())),
        ReconciliationEnvelope: z.toJSONSchema(responseEnvelope(reconciliationSchema)),
        ApiError: z.toJSONSchema(apiErrorSchema),
      },
    },
  };
}
