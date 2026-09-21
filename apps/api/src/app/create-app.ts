import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ReadModelReader } from '@motorcove/database/reader';
import type { PublicConfig } from '@motorcove/api-contracts';
import { salesRoutes } from '../modules/sales/routes.js';
import { vehicleRoutes } from '../modules/vehicles/routes.js';
import { systemRoutes } from '../modules/system/routes.js';

export async function createApp(
  reader: ReadModelReader,
  config: PublicConfig,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: true, genReqId: () => crypto.randomUUID() });
  app.addHook('onClose', async () => reader.close());
  await app.register(cors, {
    origin: [
      'http://127.0.0.1:5173',
      'http://localhost:5173',
      process.env.MOTORCOVE_WEB_ORIGIN,
    ].filter((origin): origin is string => Boolean(origin)),
  });
  app.get('/health/live', async () => ({ status: 'live' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      reader.systemStatus();
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'not_ready' });
    }
  });
  app.get('/v1/config', async () => config);
  await app.register(salesRoutes(reader, config.deploymentId));
  await app.register(vehicleRoutes(reader));
  await app.register(systemRoutes(reader));
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, requestId: request.id }, 'request failed');
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('UNINITIALIZED') || message.includes('MISMATCH') ? 503 : 500;
    return reply.code(status).send({
      error: {
        code: status === 503 ? 'READ_MODEL_UNAVAILABLE' : 'INTERNAL_ERROR',
        message: status === 503 ? 'Read model is not ready' : 'Request failed',
        requestId: request.id,
      },
    });
  });
  return app;
}
