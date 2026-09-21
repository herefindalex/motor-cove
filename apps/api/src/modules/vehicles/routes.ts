import type { FastifyPluginAsync } from 'fastify';
import type { ReadModelReader } from '@motorcove/database/reader';
import { responseEnvelope, vehicleSchema } from '@motorcove/api-contracts';
export const vehicleRoutes =
  (reader: Pick<ReadModelReader, 'listVehicles'>): FastifyPluginAsync =>
  async (app) => {
    app.get('/v1/vehicles', async () =>
      responseEnvelope(vehicleSchema.array()).parse(reader.listVehicles()),
    );
  };
