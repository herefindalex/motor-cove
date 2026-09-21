import { motorCoveEscrowAbi } from '@motorcove/chain-artifacts';
import { openProjectionWriter } from '@motorcove/database/projection-writer';
import { createPublicClient, http, keccak256, type Address } from 'viem';
import { ViemChainReader } from '../adapters/evm/viem-chain-reader.js';
import { SqliteProjectionStore } from '../adapters/sqlite/sqlite-projection-store.js';
import { ingestRange } from '../application/ingest-range.js';
import { loadConfig, logScopeHash } from '../runtime/config.js';

if (!process.argv.includes('--yes')) throw new Error('CONFIRMATION_REQUIRED: pass --yes');
const value = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const config = loadConfig();
const fromRaw = value('from') ?? config.manifest.scanStartBlock;
if (!/^\d+$/.test(fromRaw)) throw new Error('INVALID_REINDEX_BLOCK');
const fromBlock = BigInt(fromRaw);
if (fromBlock < BigInt(config.manifest.scanStartBlock))
  throw new Error('REINDEX_BEFORE_SCAN_START');

const client = createPublicClient({ transport: http(config.rpcUrl) });
const chainId = await client.getChainId();
const nft = config.manifest.nft.address as Address;
const escrow = config.manifest.escrow.address as Address;
const [nftCode, escrowCode, onChainDeploymentId] = await Promise.all([
  client.getCode({ address: nft }),
  client.getCode({ address: escrow }),
  client.readContract({ address: escrow, abi: motorCoveEscrowAbi, functionName: 'deploymentId' }),
]);
if (
  String(chainId) !== config.manifest.chainId ||
  !nftCode ||
  !escrowCode ||
  keccak256(nftCode) !== config.manifest.nft.runtimeCodeHash ||
  keccak256(escrowCode) !== config.manifest.escrow.runtimeCodeHash ||
  onChainDeploymentId !== config.manifest.deploymentId
)
  throw new Error('DEPLOYMENT_MISMATCH: runtime identity');

const target = await client.getBlock();
if (!target.hash) throw new Error('REINDEX_TARGET_HASH_MISSING');
const writer = await openProjectionWriter(config.environment);
try {
  const store = new SqliteProjectionStore(
    writer.database,
    config.manifest.deploymentId,
    config.manifest.nft.address,
    logScopeHash(config.manifest),
  );
  store.rewindFrom(fromBlock);
  const rebuild = store.rebuildFromJournal();
  const chain = new ViemChainReader(client, nft, escrow);
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const checkpoint = await store.checkpoint();
    if (checkpoint && checkpoint.number >= target.number) break;
    await ingestRange(
      chain,
      store,
      config.batchSize,
      BigInt(config.manifest.scanStartBlock),
      config.indexingDepth,
    );
  }
  const checkpoint = await store.checkpoint();
  if (
    !checkpoint ||
    checkpoint.number < target.number ||
    !store.hasCanonicalBlock(target.number, target.hash)
  )
    throw new Error('REINDEX_CATCHUP_INCOMPLETE');
  console.log(
    JSON.stringify({
      service: 'reindex',
      status: 'complete',
      deploymentId: config.manifest.deploymentId,
      fromBlock: fromBlock.toString(),
      targetBlock: target.number.toString(),
      targetHash: target.hash,
      ...rebuild,
    }),
  );
} finally {
  await writer.close();
}
