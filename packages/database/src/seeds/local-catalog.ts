import type { CatalogSeedSet } from '../maintenance/catalog-seed.js';

export const localCatalogVehicles = [
  {
    catalogId: 'apex-gt',
    name: 'Apex GT',
    description: 'Track-inspired electric coupe',
    model: 'Apex GT',
    modelYear: '2026',
    imagePath: '/vehicles/apex-gt.svg',
  },
  {
    catalogId: 'harbor-rs',
    name: 'Harbor RS',
    description: 'Performance roadster',
    model: 'Harbor RS',
    modelYear: '2026',
    imagePath: '/vehicles/harbor-rs.svg',
  },
  {
    catalogId: 'cinder-xr',
    name: 'Cinder XR',
    description: 'Rally-inspired crossover',
    model: 'Cinder XR',
    modelYear: '2026',
    imagePath: '/vehicles/cinder-xr.svg',
  },
  {
    catalogId: 'vale-touring',
    name: 'Vale Touring',
    description: 'Grand touring collectible',
    model: 'Vale Touring',
    modelYear: '2026',
    imagePath: '/vehicles/vale-touring.svg',
  },
] as const;

export function localCatalogSeed(deploymentId: string, collectionAddress: string): CatalogSeedSet {
  return {
    id: 'motorcove-local-catalog',
    version: '1',
    vehicles: localCatalogVehicles,
    bindings: localCatalogVehicles.map((vehicle, index) => ({
      deploymentId,
      collectionAddress,
      tokenId: String(index + 1),
      catalogId: vehicle.catalogId,
    })),
  };
}
