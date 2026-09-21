import { openProjectionWriter } from '@motorcove/database/projection-writer';
import { motorCoveEscrowAbi } from '@motorcove/chain-artifacts';
import { createPublicClient, http, keccak256, type Address } from 'viem';
import { loadConfig, logScopeHash } from './runtime/config.js';
import { ViemChainReader } from './adapters/evm/viem-chain-reader.js';
import { SqliteProjectionStore } from './adapters/sqlite/sqlite-projection-store.js';
import { ingestRange } from './application/ingest-range.js';

const config = loadConfig();
const client = createPublicClient({ transport: http(config.rpcUrl) });
const chainId = await client.getChainId();
if (String(chainId) !== config.manifest.chainId) throw new Error('DEPLOYMENT_MISMATCH: chain id');
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
)
  throw new Error('DEPLOYMENT_MISMATCH: runtime identity');
const writer = await openProjectionWriter(config.environment);
const store = new SqliteProjectionStore(
  writer.database,
  config.manifest.deploymentId,
  config.manifest.nft.address,
  logScopeHash(config.manifest),
);
const chain = new ViemChainReader(client, nft, escrow);
const stop = async () => {
  await writer.close();
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
do {
  const head = await chain.getHead();
  store.observe(head.number);
  await ingestRange(
    chain,
    store,
    config.batchSize,
    BigInt(config.manifest.scanStartBlock),
    config.indexingDepth,
  );
  if (process.env.MOTORCOVE_INDEXER_ONCE === '1') break;
  await new Promise((resolve) => setTimeout(resolve, 1000));
} while (true);
await writer.close();
