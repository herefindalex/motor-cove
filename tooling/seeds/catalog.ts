import { readFileSync } from 'node:fs';
import { seedCatalog } from '@motorcove/database/maintenance';
import { deploymentManifestSchema } from '@motorcove/chain-artifacts/manifest';
import { output, target, value } from '../db/args.js';
import { localCatalogSeed } from '@motorcove/database/seeds';
const paths = target();
const set = value('set') ?? 'motorcove-local-catalog';
if (set !== 'motorcove-local-catalog') throw new Error('UNKNOWN_SEED_SET');
const manifest = deploymentManifestSchema.parse(
  JSON.parse(readFileSync(paths.deploymentPath, 'utf8')),
);
output(await seedCatalog(paths, localCatalogSeed(manifest.deploymentId, manifest.nft.address)));
