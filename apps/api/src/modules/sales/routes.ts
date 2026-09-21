import { fundingObservationQuerySchema } from '@motorcove/api-contracts';
import type { FastifyPluginAsync } from 'fastify';
import { getSaleDetail } from './get-sale-detail.js';
import { listSales } from './list-sales.js';
import type { SalesReader } from './ports.js';
import { presentFundingObservation, presentSale, presentSales } from './presenter.js';

interface SaleObservationQuery {
  deploymentId?: string;
  observeTxHash?: string;
  observeBlockNumber?: string;
  observeBlockHash?: string;
  observeLogIndex?: string;
}

export const salesRoutes =
  (reader: SalesReader, deploymentId: string): FastifyPluginAsync =>
  async (app) => {
    app.get('/v1/sales', async () => presentSales(listSales(reader)));
    app.get<{ Params: { saleId: string }; Querystring: SaleObservationQuery }>(
      '/v1/sales/:saleId',
      async (request, reply) => {
        if (!/^(0|[1-9]\d*)$/.test(request.params.saleId))
          return reply.code(400).send({
            error: {
              code: 'INVALID_SALE_ID',
              message: 'Sale ID must be an unsigned decimal integer',
              requestId: request.id,
            },
          });

        const hasObservationSelector = Object.values(request.query).some(
          (value) => value !== undefined,
        );
        if (hasObservationSelector) {
          const parsed = fundingObservationQuerySchema.safeParse(request.query);
          if (!parsed.success)
            return reply.code(400).send({
              error: {
                code: 'INVALID_OBSERVATION_SELECTOR',
                message: 'Funding observation selector must be complete and valid',
                requestId: request.id,
              },
            });
          if (parsed.data.deploymentId.toLowerCase() !== deploymentId.toLowerCase())
            return reply.code(409).send({
              error: {
                code: 'DEPLOYMENT_MISMATCH',
                message: 'Observation deployment does not match the active deployment',
                requestId: request.id,
              },
            });
          const result = reader.observeFunding(request.params.saleId, {
            transactionHash: parsed.data.observeTxHash,
            blockNumber: parsed.data.observeBlockNumber,
            blockHash: parsed.data.observeBlockHash,
            logIndex: parsed.data.observeLogIndex,
          });
          return presentFundingObservation(result);
        }

        const result = getSaleDetail(reader, request.params.saleId);
        if (result.data === null)
          return reply.code(404).send({
            error: {
              code: 'SALE_NOT_FOUND',
              message: 'Sale was not found',
              requestId: request.id,
            },
          });
        return presentSale(result);
      },
    );
  };
