import type { FastifyPluginAsync } from 'fastify';
import type { ReadModelReader } from '@motorcove/database/reader';
import {
  reconciliationSchema,
  responseEnvelope,
  systemEventSchema,
  systemStatusSchema,
} from '@motorcove/api-contracts';
export const systemRoutes =
  (
    reader: Pick<ReadModelReader, 'systemStatus' | 'recentEvents' | 'latestReconciliation'>,
  ): FastifyPluginAsync =>
  async (app) => {
    app.get('/v1/system/status', async () =>
      responseEnvelope(systemStatusSchema).parse(reader.systemStatus()),
    );
    app.get('/v1/system/events', async () =>
      responseEnvelope(systemEventSchema.array()).parse(reader.recentEvents()),
    );
    app.get('/v1/system/reconciliation', async () =>
      responseEnvelope(reconciliationSchema).parse(reader.latestReconciliation()),
    );
  };
