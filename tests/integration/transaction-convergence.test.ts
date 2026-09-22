import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  http,
  parseEther,
  type Address,
} from 'viem';
import { fundingObservationResponseSchema } from '../../packages/api-contracts/src/index.js';
import {
  resumeJournalEntry,
  type JournalEntry,
  type TransactionJournal,
} from '../../apps/web/src/capabilities/transactions/index.js';
import { createTransactionChainReader } from '../../apps/web/src/integrations/evm/inspect-transaction.js';
import { motorCoveEscrowAbi } from '../../packages/chain-artifacts/src/index.js';
import {
  deploymentManifestSchema,
  type DeploymentManifest,
} from '../../packages/chain-artifacts/src/manifest.js';
import { environmentPaths } from '../../packages/database/src/connection/environment.js';

describe('transaction recovery converges across Anvil, API, SQLite, and Indexer', () => {
  const root = resolve(import.meta.dirname, '../..');
  const directory = mkdtempSync(join(tmpdir(), 'motorcove-convergence-'));
  const rpcUrl = 'http://127.0.0.1:18546';
  const apiUrl = 'http://127.0.0.1:19002';
  const environmentId = 'transaction-convergence';
  const paths = environmentPaths(directory, environmentId);
  const environment = {
    ...process.env,
    PATH: `${resolve(process.env.HOME ?? '', '.foundry/bin')}:${process.env.PATH ?? ''}`,
    MOTORCOVE_RPC_URL: rpcUrl,
    MOTORCOVE_WORKSPACE_ROOT: directory,
    MOTORCOVE_ENV: environmentId,
  };
  let anvil: ChildProcess;
  let api: ChildProcess;
  let manifest: DeploymentManifest;

  const runIndexer = () =>
    execFileSync(
      'corepack',
      ['pnpm', '--filter', '@motorcove/indexer', 'exec', 'tsx', 'src/main.ts'],
      {
        cwd: root,
        env: { ...environment, MOTORCOVE_INDEXER_ONCE: '1' },
        stdio: 'pipe',
      },
    );

  const waitFor = async (url: string, init?: RequestInit) => {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      try {
        if ((await fetch(url, init)).ok) return;
      } catch {
        // Process is still starting.
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
    throw new Error(`service did not become ready: ${url}`);
  };

  beforeAll(async () => {
    anvil = spawn(
      'anvil',
      ['--host', '127.0.0.1', '--port', '18546', '--chain-id', '31337', '--silent'],
      { cwd: root, env: environment, stdio: 'pipe' },
    );
    await waitFor(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
    });
    execFileSync('corepack', ['pnpm', '--filter', '@motorcove/indexer', 'bootstrap'], {
      cwd: root,
      env: environment,
      stdio: 'pipe',
    });
    manifest = deploymentManifestSchema.parse(
      JSON.parse(readFileSync(paths.deploymentPath, 'utf8')),
    );
    runIndexer();
    api = spawn('corepack', ['pnpm', '--filter', '@motorcove/api', 'exec', 'tsx', 'src/main.ts'], {
      cwd: root,
      env: { ...environment, MOTORCOVE_API_PORT: '19002' },
      stdio: 'pipe',
      detached: true,
    });
    await waitFor(`${apiUrl}/v1/config`);
  }, 60_000);

  afterAll(() => {
    if (api?.pid)
      try {
        process.kill(-api.pid, 'SIGTERM');
      } catch {
        // The isolated API process group already exited.
      }
    anvil?.kill('SIGTERM');
    rmSync(directory, { recursive: true, force: true });
  });

  it('recovers a saved funding hash during Indexer lag and reaches a reflected snapshot without resubmission', async () => {
    if (!manifest.demoAccounts) throw new Error('Missing demo accounts');
    const chain = defineChain({
      id: 31_337,
      name: 'MotorCove test',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    });
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
    const buyer = createWalletClient({
      chain,
      account: manifest.demoAccounts.buyer as Address,
      transport: http(rpcUrl),
    });
    const escrow = manifest.escrow.address as Address;
    const calldata = encodeFunctionData({
      abi: motorCoveEscrowAbi,
      functionName: 'fundSale',
      args: [1n],
    });
    let submissionCalls = 0;
    submissionCalls += 1;
    const transactionHash = await buyer.writeContract({
      address: escrow,
      abi: motorCoveEscrowAbi,
      functionName: 'fundSale',
      args: [1n],
      value: parseEther('1'),
    });
    await publicClient.waitForTransactionReceipt({ hash: transactionHash });

    const original: JournalEntry = {
      schemaVersion: 1,
      clientOperationId: 'real-funding-operation',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deploymentId: manifest.deploymentId,
      chainId: Number(manifest.chainId),
      account: manifest.demoAccounts.buyer,
      protocolVersion: manifest.protocolVersion,
      action: 'FUND_SALE',
      saleId: '1',
      intendedContract: escrow,
      intendedCalldata: calldata,
      calldataSummary: 'FUND_SALE',
      valueWei: String(parseEther('1')),
      originalTxHash: transactionHash,
      currentTxHash: transactionHash,
      evidenceSource: 'WALLET_RETURNED',
      association: 'EXACT_SUBMISSION',
      status: 'SUBMITTED',
    };
    const entries = [JSON.parse(JSON.stringify(original)) as JournalEntry];
    const journal: TransactionJournal = {
      load: () => entries,
      loadIssues: () => [],
      save: (value) => {
        entries[0] = value;
        return value;
      },
      subscribe: () => () => undefined,
    };
    const observation = {
      observeFunding: async (input: {
        saleId: string;
        deploymentId: string;
        observeTxHash: string;
        observeBlockNumber: string;
        observeBlockHash: string;
        observeLogIndex: number;
      }) => {
        expect(input.deploymentId).toBe(manifest.deploymentId);
        const query = new URLSearchParams({
          deploymentId: input.deploymentId,
          observeTxHash: input.observeTxHash,
          observeBlockNumber: input.observeBlockNumber,
          observeBlockHash: input.observeBlockHash,
          observeLogIndex: String(input.observeLogIndex),
        });
        const response = await fetch(`${apiUrl}/v1/sales/${input.saleId}?${query.toString()}`);
        const body = (await response.json()) as unknown;
        expect(response.status, JSON.stringify(body)).toBe(200);
        return fundingObservationResponseSchema.parse(body);
      },
    };
    const recoveryPorts = {
      chain: createTransactionChainReader(publicClient),
      observation,
      journal,
    };

    expect(await resumeJournalEntry(entries[0]!, recoveryPorts)).toEqual({ kind: 'SYNCING' });
    expect(entries[0]?.projectionObservation).toBe('NOT_REACHED');
    expect(submissionCalls).toBe(1);

    runIndexer();

    expect(await resumeJournalEntry(entries[0]!, recoveryPorts)).toEqual({ kind: 'REFLECTED' });
    expect(entries[0]).toMatchObject({
      currentTxHash: transactionHash,
      receiptStatus: 'SUCCESS',
      projectionObservation: 'REFLECTED',
    });
    expect(submissionCalls).toBe(1);
  }, 60_000);
});
