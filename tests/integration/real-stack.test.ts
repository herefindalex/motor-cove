import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Address,
} from 'viem';
import { motorCoveEscrowAbi, vehicleNftAbi } from '../../packages/chain-artifacts/src/index.js';
import { createReadOnlyReader } from '../../packages/database/src/reader/index.js';
import { environmentPaths } from '../../packages/database/src/connection/environment.js';
import {
  deploymentManifestSchema,
  type DeploymentManifest,
} from '../../packages/chain-artifacts/src/manifest.js';

describe('real Anvil → indexer → SQLite flow', () => {
  const root = resolve(import.meta.dirname, '../..');
  const directory = mkdtempSync(join(tmpdir(), 'motorcove-stack-'));
  const rpcUrl = 'http://127.0.0.1:18545';
  const environmentId = 'real-stack';
  const managedPaths = environmentPaths(directory, environmentId);
  const manifestPath = managedPaths.deploymentPath;
  const environment = {
    ...process.env,
    PATH: `${resolve(process.env.HOME ?? '', '.foundry/bin')}:${process.env.PATH ?? ''}`,
    MOTORCOVE_RPC_URL: rpcUrl,
    MOTORCOVE_WORKSPACE_ROOT: directory,
    MOTORCOVE_ENV: environmentId,
  };
  let anvil: ChildProcess;
  let manifest: DeploymentManifest;
  const runIndexer = () =>
    execFileSync(
      'corepack',
      ['pnpm', '--filter', '@motorcove/indexer', 'exec', 'tsx', 'src/main.ts'],
      { cwd: root, env: { ...environment, MOTORCOVE_INDEXER_ONCE: '1' }, stdio: 'pipe' },
    );
  const rpc = async (method: string, params: unknown[] = []) =>
    fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
  const rpcValue = async (method: string, params: unknown[] = []) =>
    ((await (await rpc(method, params)).json()) as { result: unknown }).result;
  beforeAll(async () => {
    anvil = spawn(
      'anvil',
      ['--host', '127.0.0.1', '--port', '18545', '--chain-id', '31337', '--silent'],
      { cwd: root, env: environment, stdio: 'pipe' },
    );
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        if ((await rpc('eth_chainId')).ok) break;
      } catch {
        /* wait */
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    execFileSync('corepack', ['pnpm', '--filter', '@motorcove/indexer', 'bootstrap'], {
      cwd: root,
      env: environment,
      stdio: 'pipe',
    });
    runIndexer();
    manifest = deploymentManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
  }, 60_000);
  afterAll(() => {
    anvil?.kill('SIGTERM');
    rmSync(directory, { recursive: true, force: true });
  });

  it('admits only one of two concurrent full bootstrap processes', async () => {
    const beforeBlock = await rpcValue('eth_blockNumber');
    const beforeJournal = readFileSync(managedPaths.seedJournalPath, 'utf8');
    const runBootstrap = () =>
      new Promise<{ code: number | null; output: string }>((resolveRun) => {
        const child = spawn('corepack', ['pnpm', '--filter', '@motorcove/indexer', 'bootstrap'], {
          cwd: root,
          env: environment,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
        child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
        child.once('exit', (code) => resolveRun({ code, output }));
      });

    const outcomes = await Promise.all([runBootstrap(), runBootstrap()]);
    expect(outcomes.map(({ code }) => code).sort()).toEqual([0, 1]);
    expect(outcomes.find(({ code }) => code !== 0)?.output).toContain('RESOURCE_BUSY');
    expect(await rpcValue('eth_blockNumber')).toBe(beforeBlock);
    expect(readFileSync(managedPaths.seedJournalPath, 'utf8')).toBe(beforeJournal);
  }, 60_000);

  it('projects complete, withdraw, expiry, refund, and reclaim independently', async () => {
    if (!manifest.demoAccounts) throw new Error('Missing demo accounts');
    const chain = defineChain({
      id: 31337,
      name: 'Test',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    });
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
    const buyer = createWalletClient({
      chain,
      account: manifest.demoAccounts.buyer as Address,
      transport: http(rpcUrl),
    });
    const seller = createWalletClient({
      chain,
      account: manifest.demoAccounts.seller as Address,
      transport: http(rpcUrl),
    });
    const outsider = createWalletClient({
      chain,
      account: manifest.demoAccounts.outsider as Address,
      transport: http(rpcUrl),
    });
    const escrow = manifest.escrow.address as Address;
    const nft = manifest.nft.address as Address;
    const send = async (promise: Promise<`0x${string}`>) =>
      publicClient.waitForTransactionReceipt({ hash: await promise });

    await send(
      buyer.writeContract({
        address: escrow,
        abi: motorCoveEscrowAbi,
        functionName: 'fundSale',
        args: [1n],
        value: parseEther('1'),
      }),
    );
    await send(
      buyer.writeContract({
        address: escrow,
        abi: motorCoveEscrowAbi,
        functionName: 'completeSale',
        args: [1n],
      }),
    );
    await send(
      seller.writeContract({
        address: escrow,
        abi: motorCoveEscrowAbi,
        functionName: 'withdrawPayment',
        args: [1n, manifest.demoAccounts.seller as Address],
      }),
    );
    await send(
      seller.writeContract({
        address: nft,
        abi: vehicleNftAbi,
        functionName: 'approve',
        args: [escrow, 2n],
      }),
    );
    await send(
      seller.writeContract({
        address: escrow,
        abi: motorCoveEscrowAbi,
        functionName: 'createSale',
        args: [2n, parseEther('2')],
      }),
    );
    await send(
      buyer.writeContract({
        address: escrow,
        abi: motorCoveEscrowAbi,
        functionName: 'fundSale',
        args: [2n],
        value: parseEther('2'),
      }),
    );
    await rpc('evm_increaseTime', [301]);
    await rpc('evm_mine');
    await send(
      outsider.writeContract({
        address: escrow,
        abi: motorCoveEscrowAbi,
        functionName: 'expireSale',
        args: [2n],
      }),
    );
    await send(
      buyer.writeContract({
        address: escrow,
        abi: motorCoveEscrowAbi,
        functionName: 'withdrawPayment',
        args: [2n, manifest.demoAccounts.buyer as Address],
      }),
    );
    await send(
      seller.writeContract({
        address: escrow,
        abi: motorCoveEscrowAbi,
        functionName: 'reclaimToken',
        args: [2n, manifest.demoAccounts.seller as Address],
      }),
    );
    runIndexer();
    const reader = await createReadOnlyReader(managedPaths, manifest.deploymentId);
    const sales = reader.listSales().data;
    const vehicles = reader.listVehicles().data;
    await reader.close();
    expect(sales.find((sale) => sale.saleId === '1')).toMatchObject({
      status: 'COMPLETED',
      claim: { kind: 'SELLER_PROCEEDS', status: 'WITHDRAWN' },
    });
    expect(sales.find((sale) => sale.saleId === '2')).toMatchObject({
      status: 'EXPIRED',
      tokenReclaimed: true,
      claim: { kind: 'BUYER_REFUND', status: 'WITHDRAWN' },
    });
    expect(vehicles.find((vehicle) => vehicle.tokenId === '1')?.currentOwner).toBe(
      manifest.demoAccounts.buyer.toLowerCase(),
    );
    expect(vehicles.find((vehicle) => vehicle.tokenId === '2')?.currentOwner).toBe(
      manifest.demoAccounts.seller.toLowerCase(),
    );

    const beforeRerun = {
      blockNumber: await publicClient.getBlockNumber({ cacheTime: 0 }),
      nextTokenId: await publicClient.readContract({
        address: nft,
        abi: vehicleNftAbi,
        functionName: 'nextTokenId',
      }),
      saleCount: await publicClient.readContract({
        address: escrow,
        abi: motorCoveEscrowAbi,
        functionName: 'saleCount',
      }),
      tokenOneOwner: await publicClient.readContract({
        address: nft,
        abi: vehicleNftAbi,
        functionName: 'ownerOf',
        args: [1n],
      }),
      manifest: readFileSync(manifestPath, 'utf8'),
      seedJournal: readFileSync(managedPaths.seedJournalPath, 'utf8'),
    };

    execFileSync('corepack', ['pnpm', '--filter', '@motorcove/indexer', 'bootstrap'], {
      cwd: root,
      env: environment,
      stdio: 'pipe',
    });

    expect(await publicClient.getBlockNumber({ cacheTime: 0 })).toBe(beforeRerun.blockNumber);
    expect(
      await publicClient.readContract({
        address: nft,
        abi: vehicleNftAbi,
        functionName: 'nextTokenId',
      }),
    ).toBe(beforeRerun.nextTokenId);
    expect(
      await publicClient.readContract({
        address: escrow,
        abi: motorCoveEscrowAbi,
        functionName: 'saleCount',
      }),
    ).toBe(beforeRerun.saleCount);
    expect(
      await publicClient.readContract({
        address: nft,
        abi: vehicleNftAbi,
        functionName: 'ownerOf',
        args: [1n],
      }),
    ).toBe(beforeRerun.tokenOneOwner);
    expect(readFileSync(manifestPath, 'utf8')).toBe(beforeRerun.manifest);
    expect(readFileSync(managedPaths.seedJournalPath, 'utf8')).toBe(beforeRerun.seedJournal);

    const afterBootstrapRerun = await createReadOnlyReader(managedPaths, manifest.deploymentId);
    expect(afterBootstrapRerun.getSale('1').data).toMatchObject({
      status: 'COMPLETED',
      claim: { kind: 'SELLER_PROCEEDS', status: 'WITHDRAWN' },
    });
    expect(afterBootstrapRerun.getSale('2').data).toMatchObject({
      status: 'EXPIRED',
      tokenReclaimed: true,
      claim: { kind: 'BUYER_REFUND', status: 'WITHDRAWN' },
    });
    await afterBootstrapRerun.close();
  }, 60_000);

  it('detects reconciliation mismatch, rebuilds, then stops on a changed checkpoint hash', async () => {
    await rpc('evm_mine');
    execFileSync('corepack', ['pnpm', 'ops:reconcile'], {
      cwd: root,
      env: environment,
      stdio: 'pipe',
    });
    const laggingReport = JSON.parse(
      execFileSync(
        'sqlite3',
        [
          managedPaths.databasePath,
          "SELECT json_object('comparison',comparison,'freshness',freshness) FROM reconciliation_runs ORDER BY created_at DESC LIMIT 1;",
        ],
        { cwd: root, encoding: 'utf8' },
      ).trim(),
    ) as { comparison: string; freshness: string };
    expect(laggingReport).toEqual({
      comparison: 'MATCH',
      freshness: 'PROJECTION_LAGGING',
    });
    execFileSync(
      'sqlite3',
      [
        managedPaths.databasePath,
        `INSERT INTO payment_claims(deployment_id,sale_id,beneficiary,amount_wei,kind,status,creation_block_hash,creation_log_index) VALUES ('${manifest.deploymentId}','999','${manifest.demoAccounts?.seller.toLowerCase()}','1','SELLER_PROCEEDS','CLAIMABLE','${manifest.escrow.blockHash.toLowerCase()}',0);`,
      ],
      { cwd: root },
    );
    expect(() =>
      execFileSync('corepack', ['pnpm', 'ops:reconcile'], {
        cwd: root,
        env: environment,
        stdio: 'pipe',
      }),
    ).toThrow();
    const orphanClaimDifferences = JSON.parse(
      execFileSync(
        'sqlite3',
        [
          managedPaths.databasePath,
          'SELECT differences_json FROM reconciliation_runs ORDER BY created_at DESC LIMIT 1;',
        ],
        { cwd: root, encoding: 'utf8' },
      ).trim(),
    ) as Array<Record<string, unknown>>;
    expect(orphanClaimDifferences).toContainEqual({
      saleId: '999',
      field: 'paymentClaim',
      difference: 'EXTRA_PROJECTED_ROW',
      projected: {
        beneficiary: manifest.demoAccounts?.seller.toLowerCase(),
        amountWei: '1',
        kind: 'SELLER_PROCEEDS',
        status: 'CLAIMABLE',
      },
      chain: null,
    });
    execFileSync(
      'sqlite3',
      [
        managedPaths.databasePath,
        `DELETE FROM payment_claims WHERE deployment_id='${manifest.deploymentId}' AND sale_id='999';`,
      ],
      { cwd: root },
    );
    execFileSync('corepack', ['pnpm', 'ops:reconcile'], {
      cwd: root,
      env: environment,
      stdio: 'pipe',
    });
    const beforeRebuild = await createReadOnlyReader(managedPaths, manifest.deploymentId);
    const originalBuildId = beforeRebuild.systemStatus().provenance.projectionBuildId;
    expect(beforeRebuild.getSale('1').data?.status).toBe('COMPLETED');
    await beforeRebuild.close();

    const unexpectedCollection = `0x${'d'.repeat(40)}`;
    execFileSync(
      'sqlite3',
      [
        managedPaths.databasePath,
        `INSERT INTO token_ownership(deployment_id,collection_address,token_id,owner,last_transfer_block_hash,last_transfer_log_index,updated_block) SELECT deployment_id,'${unexpectedCollection}',token_id,owner,last_transfer_block_hash,last_transfer_log_index,updated_block FROM token_ownership WHERE deployment_id='${manifest.deploymentId}' AND collection_address='${manifest.nft.address.toLowerCase()}' AND token_id='1';`,
      ],
      { cwd: root },
    );
    expect(() =>
      execFileSync('corepack', ['pnpm', 'ops:reconcile'], {
        cwd: root,
        env: environment,
        stdio: 'pipe',
      }),
    ).toThrow();
    const extraCollectionDifferences = JSON.parse(
      execFileSync(
        'sqlite3',
        [
          managedPaths.databasePath,
          'SELECT differences_json FROM reconciliation_runs ORDER BY created_at DESC LIMIT 1;',
        ],
        { cwd: root, encoding: 'utf8' },
      ).trim(),
    ) as Array<Record<string, unknown>>;
    expect(extraCollectionDifferences).toContainEqual({
      collectionAddress: unexpectedCollection,
      tokenId: '1',
      field: 'currentOwner',
      difference: 'UNEXPECTED_COLLECTION',
      projected: manifest.demoAccounts?.buyer.toLowerCase(),
      chain: null,
    });
    execFileSync(
      'sqlite3',
      [
        managedPaths.databasePath,
        `DELETE FROM token_ownership WHERE deployment_id='${manifest.deploymentId}' AND collection_address='${manifest.nft.address.toLowerCase()}' AND token_id='1';`,
      ],
      { cwd: root },
    );
    expect(() =>
      execFileSync('corepack', ['pnpm', 'ops:reconcile'], {
        cwd: root,
        env: environment,
        stdio: 'pipe',
      }),
    ).toThrow();
    const wrongCollectionOnlyDifferences = JSON.parse(
      execFileSync(
        'sqlite3',
        [
          managedPaths.databasePath,
          'SELECT differences_json FROM reconciliation_runs ORDER BY created_at DESC LIMIT 1;',
        ],
        { cwd: root, encoding: 'utf8' },
      ).trim(),
    ) as Array<Record<string, unknown>>;
    expect(wrongCollectionOnlyDifferences).toContainEqual({
      collectionAddress: manifest.nft.address.toLowerCase(),
      tokenId: '1',
      field: 'currentOwner',
      projected: null,
      chain: manifest.demoAccounts?.buyer.toLowerCase(),
    });
    expect(wrongCollectionOnlyDifferences).toContainEqual({
      collectionAddress: unexpectedCollection,
      tokenId: '1',
      field: 'currentOwner',
      difference: 'UNEXPECTED_COLLECTION',
      projected: manifest.demoAccounts?.buyer.toLowerCase(),
      chain: null,
    });
    execFileSync(
      'sqlite3',
      [
        managedPaths.databasePath,
        `DELETE FROM token_ownership WHERE deployment_id='${manifest.deploymentId}' AND collection_address='${unexpectedCollection}';`,
      ],
      { cwd: root },
    );
    execFileSync('corepack', ['pnpm', 'ops:rebuild'], {
      cwd: root,
      env: environment,
      stdio: 'pipe',
    });
    const afterTokenRebuild = await createReadOnlyReader(managedPaths, manifest.deploymentId);
    const firstRebuildSales = afterTokenRebuild.listSales().data;
    const firstRebuildVehicles = afterTokenRebuild.listVehicles().data;
    await afterTokenRebuild.close();

    execFileSync('sqlite3', [managedPaths.databasePath, "DELETE FROM sales WHERE sale_id='1';"], {
      cwd: root,
    });
    expect(() =>
      execFileSync('corepack', ['pnpm', 'ops:reconcile'], {
        cwd: root,
        env: environment,
        stdio: 'pipe',
      }),
    ).toThrow();
    execFileSync('corepack', ['pnpm', 'ops:rebuild'], {
      cwd: root,
      env: environment,
      stdio: 'pipe',
    });
    const afterRebuild = await createReadOnlyReader(managedPaths, manifest.deploymentId);
    expect(afterRebuild.getSale('1').data?.status).toBe('COMPLETED');
    expect(afterRebuild.listSales().data).toEqual(firstRebuildSales);
    expect(afterRebuild.listVehicles().data).toEqual(firstRebuildVehicles);
    expect(afterRebuild.systemStatus().provenance.projectionBuildId).not.toBe(originalBuildId);
    await afterRebuild.close();
    execFileSync('corepack', ['pnpm', 'ops:reconcile'], {
      cwd: root,
      env: environment,
      stdio: 'pipe',
    });
    const snapshot = (await rpcValue('evm_snapshot')) as string;
    await rpcValue('evm_mine');
    runIndexer();
    await rpcValue('evm_revert', [snapshot]);
    expect(() => runIndexer()).toThrow();
    expect(() =>
      execFileSync('corepack', ['pnpm', 'ops:reconcile'], {
        cwd: root,
        env: environment,
        stdio: 'pipe',
      }),
    ).toThrow();
    const unverifiableReport = JSON.parse(
      execFileSync(
        'sqlite3',
        [
          managedPaths.databasePath,
          "SELECT json_object('comparison',comparison,'differences',json(differences_json)) FROM reconciliation_runs ORDER BY created_at DESC LIMIT 1;",
        ],
        { cwd: root, encoding: 'utf8' },
      ).trim(),
    ) as { comparison: string; differences: Array<{ error?: string }> };
    expect(unverifiableReport.comparison).toBe('UNVERIFIABLE');
    expect(unverifiableReport.differences[0]?.error).toBeTruthy();
    const reader = await createReadOnlyReader(managedPaths, manifest.deploymentId);
    expect(reader.systemStatus().data.projectionStatus).toBe('RECOVERY_REQUIRED');
    await reader.close();
  }, 90_000);
});
