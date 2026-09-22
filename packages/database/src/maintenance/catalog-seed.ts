import { createHash } from 'node:crypto';
import { acquireMaintenanceLocks } from '../connection/flock.js';
import { verifyOwnedEnvironment } from '../connection/environment.js';
import { openMaintenanceDatabase } from '../connection/sqlite.js';
import type { EnvironmentPaths } from '../types/index.js';
import { assertMaintenanceComplete } from './marker.js';
import { verifyDatabase } from './migrations.js';

export interface CatalogVehicleSeed {
  readonly catalogId: string;
  readonly name: string;
  readonly description: string;
  readonly model: string;
  readonly modelYear: string;
  readonly imagePath: string;
}
export interface CatalogBindingSeed {
  readonly deploymentId: string;
  readonly collectionAddress: string;
  readonly tokenId: string;
  readonly catalogId: string;
}
export interface CatalogSeedSet {
  readonly id: string;
  readonly version: string;
  readonly vehicles: readonly CatalogVehicleSeed[];
  readonly bindings: readonly CatalogBindingSeed[];
}

export const catalogSeedDigest = (seed: CatalogSeedSet) =>
  createHash('sha256').update(JSON.stringify(seed)).digest('hex');

export async function seedCatalog(
  paths: EnvironmentPaths,
  seed: CatalogSeedSet,
  options: { locksAlreadyHeld?: boolean } = {},
) {
  verifyOwnedEnvironment(paths);
  const locks = options.locksAlreadyHeld ? undefined : await acquireMaintenanceLocks(paths);
  try {
    assertMaintenanceComplete(paths.maintenancePath);
    const db = openMaintenanceDatabase(paths.databasePath);
    try {
      verifyDatabase(db);
      let inserted = 0;
      db.transaction(() => {
        for (const item of seed.vehicles) {
          const current = db
            .prepare('SELECT * FROM catalog_vehicles WHERE catalog_id=?')
            .get(item.catalogId) as Record<string, unknown> | undefined;
          const expected = {
            catalog_id: item.catalogId,
            name: item.name,
            description: item.description,
            model: item.model,
            model_year: item.modelYear,
            image_path: item.imagePath,
            origin: 'SEEDED',
            seed_set_id: seed.id,
            seed_set_version: seed.version,
          };
          if (current) {
            for (const [key, value] of Object.entries(expected))
              if (current[key] !== value)
                throw new Error(`SEED_CONFLICT: ${item.catalogId}.${key}`);
          } else {
            const now = new Date().toISOString();
            db.prepare(
              'INSERT INTO catalog_vehicles(catalog_id,name,description,model,model_year,image_path,origin,seed_set_id,seed_set_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            ).run(
              item.catalogId,
              item.name,
              item.description,
              item.model,
              item.modelYear,
              item.imagePath,
              'SEEDED',
              seed.id,
              seed.version,
              now,
              now,
            );
            inserted += 1;
          }
        }
        for (const binding of seed.bindings) {
          const address = binding.collectionAddress.toLowerCase();
          const current = db
            .prepare(
              'SELECT * FROM catalog_asset_bindings WHERE deployment_id=? AND collection_address=? AND token_id=?',
            )
            .get(binding.deploymentId, address, binding.tokenId) as
            | Record<string, unknown>
            | undefined;
          const expected = {
            deployment_id: binding.deploymentId,
            collection_address: address,
            token_id: binding.tokenId,
            catalog_id: binding.catalogId,
            binding_source: 'SEED',
            seed_set_id: seed.id,
            seed_set_version: seed.version,
          };
          if (current) {
            for (const [key, value] of Object.entries(expected))
              if (current[key] !== value)
                throw new Error(`SEED_CONFLICT: binding.${binding.catalogId}.${key}`);
          } else {
            db.prepare(
              'INSERT INTO catalog_asset_bindings(deployment_id,collection_address,token_id,catalog_id,binding_source,seed_set_id,seed_set_version) VALUES (?,?,?,?,?,?,?)',
            ).run(...Object.values(expected));
            inserted += 1;
          }
        }
      })();
      return {
        changed: inserted > 0,
        inserted,
        seedSetId: seed.id,
        version: seed.version,
        digest: catalogSeedDigest(seed),
      };
    } finally {
      db.close();
    }
  } finally {
    await locks?.release();
  }
}
