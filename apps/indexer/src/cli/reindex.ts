import { motorCoveEscrowAbi } from '@motorcove/chain-artifacts';
import {
  backupEnvironment,
  runProjectionMaintenance,
  verifyBackup,
} from '@motorcove/database/maintenance';
import { createPublicClient, http, keccak256, type Address } from 'viem';
import { ViemChainReader } from '../adapters/evm/viem-chain-reader.js';
import { SqliteProjectionStore } from '../adapters/sqlite/sqlite-projection-store.js';
import { ingestRange } from '../application/ingest-range.js';
import { resolveReindexOperationRecovery } from '../application/reindex-target.js';
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

const chain = new ViemChainReader(client, nft, escrow);
let completedRecovery:
  | { reindexFromBlock: string; targetBlock: string; targetHash: string }
  | undefined;
const operation = await runProjectionMaintenance(config.environment, {
  operationType: 'REINDEX_PROJECTION',
  expectedDeploymentId: config.manifest.deploymentId,
  ...(fromBlock === BigInt(config.manifest.scanStartBlock)
    ? {
        sourceIncompleteRebuildTransition: {
          requiredReindexFromBlock: config.manifest.scanStartBlock,
        },
      }
    : {}),
  recovery: {
    reindexFromBlock: fromBlock.toString(),
  },
  resolveRecovery: async (existing) => {
    completedRecovery = await resolveReindexOperationRecovery(
      chain,
      config.indexingDepth,
      fromBlock,
      existing,
    );
    return completedRecovery;
  },
  run: async (database, maintenance) => {
    const targetBlock = maintenance.marker.targetBlock;
    const targetHash = maintenance.marker.targetHash;
    if (targetBlock === undefined || targetHash === undefined)
      throw new Error('REINDEX_TARGET_NOT_AVAILABLE');
    const target = { number: BigInt(targetBlock), hash: targetHash };
    const store = SqliteProjectionStore.forMaintenance(
      database,
      config.manifest.deploymentId,
      config.manifest.nft.address,
      logScopeHash(config.manifest),
      {
        supportedProjectorVersions: ['0'],
        allowLogScopeChange: fromBlock === BigInt(config.manifest.scanStartBlock),
      },
    );
    let verifiedBackupId: string | undefined;
    if (store.requiresSourceRefresh()) {
      if (maintenance.marker.backupId) {
        verifyBackup(config.environment, maintenance.marker.backupId);
        verifiedBackupId = maintenance.marker.backupId;
      } else {
        const backup = await backupEnvironment(config.environment, {
          locksAlreadyHeld: true,
          reason: `pre-reindex-source-refresh:${maintenance.marker.operationId}`,
        });
        verifyBackup(config.environment, backup.backupId);
        maintenance.recordBackup(backup.backupId);
        verifiedBackupId = backup.backupId;
      }
    }
    store.prepareForReindex(fromBlock, verifiedBackupId ? { verifiedBackupId } : undefined);
    const rebuild = store.rebuildFromJournal();
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
    return rebuild;
  },
});
if (!completedRecovery) throw new Error('REINDEX_TARGET_NOT_AVAILABLE');
console.log(
  JSON.stringify({
    service: 'reindex',
    status: 'complete',
    operationId: operation.operationId,
    deploymentId: config.manifest.deploymentId,
    fromBlock: fromBlock.toString(),
    targetBlock: completedRecovery.targetBlock,
    targetHash: completedRecovery.targetHash,
    ...operation.result,
  }),
);
