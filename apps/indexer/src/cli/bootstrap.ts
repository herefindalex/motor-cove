import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  claimManagedNode,
  migrateEnvironment,
  registerDeployment,
  seedCatalog,
} from '@motorcove/database/maintenance';
import { openProjectionWriter } from '@motorcove/database/projection-writer';
import { createReadOnlyReader } from '@motorcove/database/reader';
import { localCatalogSeed } from '@motorcove/database/seeds';
import {
  deploymentManifestSchema,
  type DeploymentManifest,
} from '@motorcove/chain-artifacts/manifest';
import { motorCoveEscrowAbi, vehicleNftAbi } from '@motorcove/chain-artifacts';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  parseEther,
  toHex,
  type Address,
  type Hex,
} from 'viem';
import { SqliteProjectionStore } from '../adapters/sqlite/sqlite-projection-store.js';
import { ViemChainReader } from '../adapters/evm/viem-chain-reader.js';
import { ingestRange } from '../application/ingest-range.js';
import { logScopeHash, paths } from '../runtime/config.js';
import { ChainSeedJournal, type ChainSeedReceipt } from './chain-seed-journal.js';
import { withBootstrapOwnership } from './bootstrap-ownership.js';

interface ForgeArtifact {
  bytecode: { object: Hex };
}
const root = resolve(import.meta.dirname, '../../../..');
const config = paths();
async function bootstrap(): Promise<void> {
  await migrateEnvironment(config.environment, { bootstrapOwnershipAlreadyHeld: true });
  execFileSync('forge', ['build', '--root', 'chain'], { cwd: root, stdio: 'inherit' });
  const localChain = defineChain({
    id: 31337,
    name: 'MotorCove Anvil',
    nativeCurrency: { name: 'Test Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  const publicClient = createPublicClient({
    chain: localChain,
    transport: http(config.rpcUrl, { batch: true }),
  });
  const chainId = await publicClient.getChainId();
  if (chainId !== 31337) throw new Error(`CHAIN_MISMATCH: expected 31337, got ${chainId}`);
  await claimManagedNode(config.environment, config.rpcUrl);
  const accountResponse: unknown = await fetch(config.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_accounts', params: [] }),
  }).then((response) => response.json());
  if (
    typeof accountResponse !== 'object' ||
    accountResponse === null ||
    !('result' in accountResponse) ||
    !Array.isArray(accountResponse.result)
  )
    throw new Error('Invalid eth_accounts response');
  const accounts = accountResponse.result.filter(
    (value): value is Address => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value),
  );
  const [deployer, seller, buyer, outsider] = accounts;
  if (!deployer || !seller || !buyer || !outsider)
    throw new Error('Anvil must expose at least four unlocked test accounts');

  const contentHash = (value: string): `0x${string}` =>
    `0x${createHash('sha256').update(value).digest('hex')}`;

  const transactionIntent = (value: Record<string, unknown>) => contentHash(JSON.stringify(value));

  const waitForJournalReceipt = async (hash: Hex): Promise<ChainSeedReceipt> => {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return {
      transactionHash: receipt.transactionHash,
      blockNumber: String(receipt.blockNumber),
      blockHash: receipt.blockHash,
      contractAddress: receipt.contractAddress ?? null,
      outcome: receipt.status === 'success' ? 'SUCCESS' : 'REVERTED',
    };
  };

  async function completeDatabaseBootstrap(manifest: DeploymentManifest) {
    const manifestJson = JSON.stringify(manifest);
    const scopeHash = logScopeHash(manifest);
    await registerDeployment(config.environment, {
      deploymentId: manifest.deploymentId,
      chainId: manifest.chainId,
      nftAddress: manifest.nft.address,
      escrowAddress: manifest.escrow.address,
      protocolVersion: manifest.protocolVersion,
      abiBundleHash: contentHash(`${manifest.nft.abiHash}:${manifest.escrow.abiHash}`),
      scanStartBlock: Number(manifest.scanStartBlock),
      nftDeploymentBlock: Number(manifest.nft.blockNumber),
      nftDeploymentHash: manifest.nft.blockHash,
      nftRuntimeCodeHash: manifest.nft.runtimeCodeHash,
      escrowDeploymentBlock: Number(manifest.escrow.blockNumber),
      escrowDeploymentHash: manifest.escrow.blockHash,
      escrowRuntimeCodeHash: manifest.escrow.runtimeCodeHash,
      manifestHash: contentHash(manifestJson),
      manifestJson,
      logScopeHash: scopeHash,
    });
    await seedCatalog(
      config.environment,
      localCatalogSeed(manifest.deploymentId, manifest.nft.address),
    );

    const target = await publicClient.getBlock();
    if (!target.hash) throw new Error('BOOTSTRAP_TARGET_HASH_MISSING');
    const writer = await openProjectionWriter(config.environment);
    try {
      const store = new SqliteProjectionStore(
        writer.database,
        manifest.deploymentId,
        manifest.nft.address,
        scopeHash,
      );
      const chain = new ViemChainReader(
        publicClient,
        manifest.nft.address as Address,
        manifest.escrow.address as Address,
      );
      for (let attempt = 0; attempt < 1_000; attempt += 1) {
        const checkpoint = await store.checkpoint();
        if (checkpoint && checkpoint.number >= target.number) break;
        await ingestRange(chain, store, 100n, BigInt(manifest.scanStartBlock), 0n);
      }
      const checkpoint = await store.checkpoint();
      if (!checkpoint || checkpoint.number < target.number)
        throw new Error('BOOTSTRAP_CATCHUP_TIMEOUT');
      if (!store.hasCanonicalBlock(target.number, target.hash))
        throw new Error('BOOTSTRAP_TARGET_NOT_CANONICAL');
    } finally {
      await writer.close();
    }

    const reader = await createReadOnlyReader(config.environment, manifest.deploymentId);
    try {
      const vehicles = reader.listVehicles();
      const sale = reader.getSale('1');
      if (vehicles.data.length !== 4 || !sale.data)
        throw new Error('BOOTSTRAP_SCENARIO_INCOMPLETE');
      if (!existsSync(config.environment.bootstrapReceiptPath))
        writeFileSync(
          config.environment.bootstrapReceiptPath,
          `${JSON.stringify(
            {
              formatVersion: 1,
              environmentId: config.environment.environmentId,
              deploymentId: manifest.deploymentId,
              targetBlock: target.number.toString(),
              targetHash: target.hash,
              projectionBuildId: sale.provenance.projectionBuildId,
              completedAt: new Date().toISOString(),
            },
            null,
            2,
          )}\n`,
          { flag: 'wx' },
        );
      return {
        targetBlock: target.number.toString(),
        targetHash: target.hash,
        projectionBuildId: sale.provenance.projectionBuildId,
      };
    } finally {
      await reader.close();
    }
  }

  if (existsSync(config.manifestPath)) {
    const deploymentMismatch =
      'DEPLOYMENT_MISMATCH: run pnpm demo:reset --yes before replacing local state';
    const manifest = deploymentManifestSchema.parse(
      JSON.parse(readFileSync(config.manifestPath, 'utf8')),
    );
    const code = await Promise.all([
      publicClient.getCode({ address: manifest.nft.address as Address }),
      publicClient.getCode({ address: manifest.escrow.address as Address }),
    ]);
    const [onChainId, boundEscrow] = await Promise.all([
      publicClient.readContract({
        address: manifest.escrow.address as Address,
        abi: motorCoveEscrowAbi,
        functionName: 'deploymentId',
      }),
      publicClient.readContract({
        address: manifest.nft.address as Address,
        abi: vehicleNftAbi,
        functionName: 'motorCoveEscrow',
      }),
    ]).catch(() => {
      throw new Error(deploymentMismatch);
    });
    if (
      manifest.chainId !== String(chainId) ||
      code[0] === undefined ||
      code[1] === undefined ||
      keccak256(code[0]) !== manifest.nft.runtimeCodeHash ||
      keccak256(code[1]) !== manifest.escrow.runtimeCodeHash ||
      onChainId !== manifest.deploymentId ||
      boundEscrow.toLowerCase() !== manifest.escrow.address.toLowerCase()
    )
      throw new Error(deploymentMismatch);
    const result = await completeDatabaseBootstrap(manifest);
    console.log(
      JSON.stringify({
        service: 'bootstrap',
        status: 'already_current',
        deploymentId: manifest.deploymentId,
        ...result,
      }),
    );
    return;
  }

  const wallet = createWalletClient({
    account: deployer,
    chain: localChain,
    transport: http(config.rpcUrl),
  });
  const nftArtifact = JSON.parse(
    readFileSync(resolve(root, 'chain/out/VehicleNFT.sol/VehicleNFT.json'), 'utf8'),
  ) as ForgeArtifact;
  const escrowArtifact = JSON.parse(
    readFileSync(resolve(root, 'chain/out/MotorCoveEscrow.sol/MotorCoveEscrow.json'), 'utf8'),
  ) as ForgeArtifact;
  const seedJournal = ChainSeedJournal.open(config.environment.seedJournalPath, {
    environmentId: config.environment.environmentId,
    chainId,
    account: deployer,
    newDeploymentId: toHex(randomBytes(32)),
  });
  const deploymentId = seedJournal.deploymentId;
  const nftReceipt = await seedJournal.transaction(
    'deploy-vehicle-nft',
    transactionIntent({
      operation: 'deployVehicleNft',
      bytecodeHash: keccak256(nftArtifact.bytecode.object),
      owner: deployer.toLowerCase(),
    }),
    () =>
      wallet.deployContract({
        abi: vehicleNftAbi,
        bytecode: nftArtifact.bytecode.object,
        args: [deployer],
      }),
    waitForJournalReceipt,
  );
  if (!nftReceipt.contractAddress) throw new Error('VehicleNFT deployment had no contract address');
  const nftAddress = nftReceipt.contractAddress;
  const escrowReceipt = await seedJournal.transaction(
    'deploy-motorcove-escrow',
    transactionIntent({
      operation: 'deployMotorCoveEscrow',
      bytecodeHash: keccak256(escrowArtifact.bytecode.object),
      nftAddress: nftAddress.toLowerCase(),
      fundingPeriodSeconds: '300',
      deploymentId,
    }),
    () =>
      wallet.deployContract({
        abi: motorCoveEscrowAbi,
        bytecode: escrowArtifact.bytecode.object,
        args: [nftAddress, 300n, deploymentId],
      }),
    waitForJournalReceipt,
  );
  if (!escrowReceipt.contractAddress) throw new Error('Escrow deployment had no contract address');
  const escrowAddress = escrowReceipt.contractAddress;

  await seedJournal.transaction(
    'bind-vehicle-nft-escrow',
    transactionIntent({
      operation: 'bindVehicleNftEscrow',
      nftAddress: nftAddress.toLowerCase(),
      escrowAddress: escrowAddress.toLowerCase(),
    }),
    () =>
      wallet.writeContract({
        address: nftAddress,
        abi: vehicleNftAbi,
        functionName: 'setEscrow',
        args: [escrowAddress],
      }),
    waitForJournalReceipt,
  );

  for (let token = 1; token <= 4; token += 1) {
    await seedJournal.transaction(
      `mint-token-${token}`,
      transactionIntent({
        operation: 'mintVehicle',
        nftAddress: nftAddress.toLowerCase(),
        recipient: seller.toLowerCase(),
        expectedTokenId: String(token),
      }),
      () =>
        wallet.writeContract({
          address: nftAddress,
          abi: vehicleNftAbi,
          functionName: 'mint',
          args: [seller],
        }),
      waitForJournalReceipt,
    );
  }
  const sellerWallet = createWalletClient({
    account: seller,
    chain: localChain,
    transport: http(config.rpcUrl),
  });
  await seedJournal.transaction(
    'approve-token-1',
    transactionIntent({
      operation: 'approveVehicle',
      nftAddress: nftAddress.toLowerCase(),
      owner: seller.toLowerCase(),
      spender: escrowAddress.toLowerCase(),
      tokenId: '1',
    }),
    () =>
      sellerWallet.writeContract({
        address: nftAddress,
        abi: vehicleNftAbi,
        functionName: 'approve',
        args: [escrowAddress, 1n],
      }),
    waitForJournalReceipt,
  );
  await seedJournal.transaction(
    'create-sale-1',
    transactionIntent({
      operation: 'createSale',
      escrowAddress: escrowAddress.toLowerCase(),
      seller: seller.toLowerCase(),
      tokenId: '1',
      priceWei: parseEther('1').toString(),
    }),
    () =>
      sellerWallet.writeContract({
        address: escrowAddress,
        abi: motorCoveEscrowAbi,
        functionName: 'createSale',
        args: [1n, parseEther('1')],
      }),
    waitForJournalReceipt,
  );

  const [nftCode, escrowCode, nftBlock, escrowBlock] = await Promise.all([
    publicClient.getCode({ address: nftAddress }),
    publicClient.getCode({ address: escrowAddress }),
    publicClient.getBlock({ blockNumber: BigInt(nftReceipt.blockNumber) }),
    publicClient.getBlock({ blockNumber: BigInt(escrowReceipt.blockNumber) }),
  ]);
  if (!nftCode || !escrowCode) throw new Error('Deployment runtime code unavailable');
  const manifest = {
    manifestVersion: 1 as const,
    deploymentId,
    chainId: String(chainId),
    protocolVersion: '0.1.0' as const,
    compiler: 'solc 0.8.24',
    buildId: 'foundry-1.8.3',
    scanStartBlock: nftReceipt.blockNumber,
    fundingPeriodSeconds: '300',
    nft: {
      address: nftAddress,
      transactionHash: nftReceipt.transactionHash,
      blockNumber: nftReceipt.blockNumber,
      blockHash: nftBlock.hash,
      runtimeCodeHash: keccak256(nftCode),
      abiHash: keccak256(toHex(JSON.stringify(vehicleNftAbi))),
    },
    escrow: {
      address: escrowAddress,
      transactionHash: escrowReceipt.transactionHash,
      blockNumber: escrowReceipt.blockNumber,
      blockHash: escrowBlock.hash,
      runtimeCodeHash: keccak256(escrowCode),
      abiHash: keccak256(toHex(JSON.stringify(motorCoveEscrowAbi))),
    },
    demoAccounts: { deployer, seller, buyer, outsider },
  };
  deploymentManifestSchema.parse(manifest);
  mkdirSync(dirname(config.manifestPath), { recursive: true });
  writeFileSync(config.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });

  const bootstrapResult = await completeDatabaseBootstrap(manifest);
  console.log(
    JSON.stringify({
      service: 'bootstrap',
      status: 'created',
      deploymentId,
      nft: manifest.nft.address,
      escrow: manifest.escrow.address,
      seller,
      buyer,
      ...bootstrapResult,
    }),
  );
}

await withBootstrapOwnership(config.environment, bootstrap);
