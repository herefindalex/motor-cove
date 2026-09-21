import { createApp } from './app/create-app.js';
import { environmentPaths } from '@motorcove/database/environment';
import { createReadOnlyReader } from '@motorcove/database/reader';
import { deploymentManifestSchema } from '@motorcove/chain-artifacts/manifest';
import { publicConfigSchema } from '@motorcove/api-contracts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const host = process.env.MOTORCOVE_API_HOST ?? '127.0.0.1';
const port = Number(process.env.MOTORCOVE_API_PORT ?? '3001');
const repositoryRoot = resolve(
  process.env.MOTORCOVE_WORKSPACE_ROOT ?? resolve(import.meta.dirname, '../../..'),
);
const environmentId = process.env.MOTORCOVE_ENV ?? 'local';
const environment = environmentPaths(repositoryRoot, environmentId);
const manifest = deploymentManifestSchema.parse(
  JSON.parse(
    readFileSync(
      process.env.MOTORCOVE_DEPLOYMENT_MANIFEST
        ? resolve(repositoryRoot, process.env.MOTORCOVE_DEPLOYMENT_MANIFEST)
        : environment.deploymentPath,
      'utf8',
    ),
  ),
);
const reader = await createReadOnlyReader(environment, manifest.deploymentId);
const status = reader.systemStatus();
if (status.provenance.deploymentId !== manifest.deploymentId)
  throw new Error('DEPLOYMENT_MISMATCH: manifest and database');
const publicConfig = publicConfigSchema.parse({
  deploymentId: manifest.deploymentId,
  chainId: manifest.chainId,
  protocolVersion: manifest.protocolVersion,
  nftAddress: manifest.nft.address,
  escrowAddress: manifest.escrow.address,
  fundingPeriodSeconds: manifest.fundingPeriodSeconds,
});
const app = await createApp(reader, publicConfig);
await app.listen({ host, port });
