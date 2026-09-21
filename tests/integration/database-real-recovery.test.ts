import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Address,
} from 'viem';
import { motorCoveEscrowAbi } from '../../packages/chain-artifacts/src/index.js';
import {
  deploymentManifestSchema,
  type DeploymentManifest,
} from '../../packages/chain-artifacts/src/manifest.js';
import { environmentPaths } from '../../packages/database/src/connection/environment.js';
import {
  backupEnvironment,
  restoreEnvironment,
} from '../../packages/database/src/maintenance/index.js';
import { createReadOnlyReader } from '../../packages/database/src/reader/index.js';

describe('real database recovery against a local chain', () => {
  const projectRoot = resolve(import.meta.dirname, '../..');
  const rpcUrl = 'http://127.0.0.1:18548';
  const chain = defineChain({
    id: 31_337,
    name: 'MotorCove recovery test',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  let workspaceRoot: string;
  let environment: NodeJS.ProcessEnv;
  let paths: ReturnType<typeof environmentPaths>;
  let manifest: DeploymentManifest;
  let anvil: ChildProcess;

  const rpc = async <T>(method: string, params: unknown[] = []): Promise<T> => {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const payload = (await response.json()) as { result?: T; error?: { message: string } };
    if (payload.error) throw new Error(payload.error.message);
    return payload.result as T;
  };

  const waitForRpc = async () => {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      try {
        await rpc('eth_chainId');
        return;
      } catch {
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      }
    }
    throw new Error('Anvil did not become ready');
  };

  const runIndexer = () =>
    execFileSync(
      'corepack',
      ['pnpm', '--filter', '@motorcove/indexer', 'exec', 'tsx', 'src/main.ts'],
      {
        cwd: projectRoot,
        env: { ...environment, MOTORCOVE_INDEXER_ONCE: '1' },
        stdio: 'pipe',
      },
    );

  const runReindex = (fromBlock: bigint, targetEnvironment = environment) =>
    execFileSync(
      'corepack',
      [
        'pnpm',
        '--filter',
        '@motorcove/indexer',
        'reindex',
        '--',
        '--from',
        String(fromBlock),
        '--yes',
      ],
      { cwd: projectRoot, env: targetEnvironment, stdio: 'pipe' },
    );

  const fundSaleOne = async () => {
    if (!manifest.demoAccounts) throw new Error('Missing demo accounts');
    const wallet = createWalletClient({
      chain,
      account: manifest.demoAccounts.buyer as Address,
      transport: http(rpcUrl),
    });
    const hash = await wallet.writeContract({
      address: manifest.escrow.address as Address,
      abi: motorCoveEscrowAbi,
      functionName: 'fundSale',
      args: [1n],
      value: parseEther('1'),
    });
    return publicClient.waitForTransactionReceipt({ hash });
  };

  beforeEach(async () => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'motorcove-real-recovery-'));
    paths = environmentPaths(workspaceRoot, 'real-recovery');
    environment = {
      ...process.env,
      PATH: `${resolve(process.env.HOME ?? '', '.foundry/bin')}:${process.env.PATH ?? ''}`,
      MOTORCOVE_RPC_URL: rpcUrl,
      MOTORCOVE_WORKSPACE_ROOT: workspaceRoot,
      MOTORCOVE_ENV: 'real-recovery',
    };
    anvil = spawn(
      'anvil',
      ['--host', '127.0.0.1', '--port', '18548', '--chain-id', '31337', '--silent'],
      { cwd: projectRoot, env: environment, stdio: 'pipe' },
    );
    await waitForRpc();
    execFileSync('corepack', ['pnpm', '--filter', '@motorcove/indexer', 'bootstrap'], {
      cwd: projectRoot,
      env: environment,
      stdio: 'pipe',
    });
    runIndexer();
    manifest = deploymentManifestSchema.parse(
      JSON.parse(readFileSync(paths.deploymentPath, 'utf8')),
    );
  }, 60_000);

  afterEach(async () => {
    anvil?.kill('SIGTERM');
    if (anvil && anvil.exitCode === null)
      await new Promise<void>((resolveExit) => anvil.once('exit', () => resolveExit()));
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('DB-40 reindexes an orphaned funding event and retains its noncanonical source evidence', async () => {
    const beforeFunding = await rpc<string>('evm_snapshot');
    const receipt = await fundSaleOne();
    runIndexer();
    let reader = await createReadOnlyReader(paths, manifest.deploymentId);
    expect(reader.getSale('1').data?.status).toBe('FUNDED');
    await reader.close();

    expect(await rpc<boolean>('evm_revert', [beforeFunding])).toBe(true);
    await rpc('evm_mine');
    expect(() => runIndexer()).toThrow();
    runReindex(receipt.blockNumber);

    reader = await createReadOnlyReader(paths, manifest.deploymentId);
    expect(reader.getSale('1').data?.status).toBe('LISTED');
    await reader.close();
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
    expect(
      db
        .prepare(
          `SELECT b.is_canonical AS canonical
           FROM chain_events e
           JOIN indexed_blocks b
             ON b.deployment_id=e.deployment_id AND b.block_hash=e.block_hash
           WHERE e.deployment_id=? AND e.tx_hash=?`,
        )
        .get(manifest.deploymentId, receipt.transactionHash.toLowerCase()),
    ).toEqual({ canonical: 0 });
    db.close();
  }, 60_000);

  it('DB-49 catches up from a verified backup restored behind the live chain head', async () => {
    const backup = await backupEnvironment(paths, { reason: 'restore-behind-head-test' });
    await fundSaleOne();
    runIndexer();
    let reader = await createReadOnlyReader(paths, manifest.deploymentId);
    expect(reader.getSale('1').data?.status).toBe('FUNDED');
    const fundedCheckpoint = reader.systemStatus().provenance.indexedBlockNumber;
    await reader.close();

    await restoreEnvironment(paths, backup.backupId, true);
    reader = await createReadOnlyReader(paths, manifest.deploymentId);
    expect(reader.getSale('1').data?.status).toBe('LISTED');
    await reader.close();

    runIndexer();
    reader = await createReadOnlyReader(paths, manifest.deploymentId);
    expect(reader.getSale('1').data?.status).toBe('FUNDED');
    expect(reader.systemStatus().provenance.indexedBlockNumber).toBe(fundedCheckpoint);
    await reader.close();
  }, 60_000);

  it('DB-41 rejects a new deployment at reused deterministic addresses after Anvil reset', async () => {
    const replacementRoot = mkdtempSync(join(tmpdir(), 'motorcove-replacement-deployment-'));
    try {
      await rpc('anvil_reset');
      const replacementEnvironment = {
        ...environment,
        MOTORCOVE_WORKSPACE_ROOT: replacementRoot,
        MOTORCOVE_ENV: 'replacement-deployment',
      };
      execFileSync('corepack', ['pnpm', '--filter', '@motorcove/indexer', 'bootstrap'], {
        cwd: projectRoot,
        env: replacementEnvironment,
        stdio: 'pipe',
      });
      const replacementPaths = environmentPaths(replacementRoot, 'replacement-deployment');
      const replacementManifest = deploymentManifestSchema.parse(
        JSON.parse(readFileSync(replacementPaths.deploymentPath, 'utf8')),
      );
      expect(replacementManifest.nft.address).toBe(manifest.nft.address);
      expect(replacementManifest.escrow.address).toBe(manifest.escrow.address);
      expect(replacementManifest.deploymentId).not.toBe(manifest.deploymentId);
      expect(() => runReindex(BigInt(manifest.scanStartBlock))).toThrow(/DEPLOYMENT_MISMATCH/);
    } finally {
      rmSync(replacementRoot, { recursive: true, force: true });
    }
  }, 60_000);
});
