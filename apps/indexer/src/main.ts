import { motorCoveEscrowAbi } from '@motorcove/chain-artifacts';
import { openProjectionWriter } from '@motorcove/database/projection-writer';
import { verifyManagedNodeOwnership } from '@motorcove/database/maintenance';
import { createPublicClient, http, keccak256, type Address } from 'viem';
import { ViemChainReader } from './adapters/evm/viem-chain-reader.js';
import { SqliteProjectionStore } from './adapters/sqlite/sqlite-projection-store.js';
import { ingestRange } from './application/ingest-range.js';
import { runIndexerLoop } from './application/run-indexer.js';
import { loadConfig, logScopeHash } from './runtime/config.js';

const config = loadConfig();
await verifyManagedNodeOwnership(config.environment, config.rpcUrl);
const client = createPublicClient({ transport: http(config.rpcUrl, { batch: true }) });
const chainId = await client.getChainId();
if (String(chainId) !== config.manifest.chainId) {
  throw new Error('DEPLOYMENT_MISMATCH: chain id');
}

const nft = config.manifest.nft.address as Address;
const escrow = config.manifest.escrow.address as Address;
const [nftCode, escrowCode, onChainDeploymentId] = await Promise.all([
  client.getCode({ address: nft }),
  client.getCode({ address: escrow }),
  client.readContract({ address: escrow, abi: motorCoveEscrowAbi, functionName: 'deploymentId' }),
]);
if (
  !nftCode ||
  !escrowCode ||
  keccak256(nftCode) !== config.manifest.nft.runtimeCodeHash ||
  keccak256(escrowCode) !== config.manifest.escrow.runtimeCodeHash ||
  onChainDeploymentId !== config.manifest.deploymentId
) {
  throw new Error('DEPLOYMENT_MISMATCH: runtime identity');
}

const writer = await openProjectionWriter(config.environment);
const store = new SqliteProjectionStore(
  writer.database,
  config.manifest.deploymentId,
  config.manifest.nft.address,
  logScopeHash(config.manifest),
);
const chain = new ViemChainReader(client, nft, escrow);

let stopping = false;
const requestStop = (signal: NodeJS.Signals) => {
  console.log(JSON.stringify({ service: 'indexer', status: 'stopping', reason: signal }));
  stopping = true;
};
process.once('SIGINT', requestStop);
process.once('SIGTERM', requestStop);

try {
  await runIndexerLoop({
    poll: () =>
      ingestRange(
        chain,
        store,
        config.batchSize,
        BigInt(config.manifest.scanStartBlock),
        config.indexingDepth,
      ),
    markStale: (reason) => store.markStale(reason),
    shouldStop: () => stopping,
    once: process.env.MOTORCOVE_INDEXER_ONCE === '1',
  });
} finally {
  process.removeListener('SIGINT', requestStop);
  process.removeListener('SIGTERM', requestStop);
  await writer.close();
}
