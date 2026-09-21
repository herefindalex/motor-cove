import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  http,
  parseEther,
  parseGwei,
  type Address,
  type Hash,
} from 'viem';
import type { JournalEntry } from '../../apps/web/src/capabilities/transactions/index.js';
import { createFundingChainReader } from '../../apps/web/src/integrations/evm/inspect-funding-transaction.js';
import { motorCoveEscrowAbi } from '../../packages/chain-artifacts/src/index.js';
import {
  deploymentManifestSchema,
  type DeploymentManifest,
} from '../../packages/chain-artifacts/src/manifest.js';
import { environmentPaths } from '../../packages/database/src/connection/environment.js';

describe('transaction replacement and reorg recovery on Anvil', () => {
  const root = resolve(import.meta.dirname, '../..');
  const directory = mkdtempSync(join(tmpdir(), 'motorcove-chain-recovery-'));
  const rpcUrl = 'http://127.0.0.1:18547';
  const environmentId = 'transaction-chain-recovery';
  const paths = environmentPaths(directory, environmentId);
  const environment = {
    ...process.env,
    PATH: `${resolve(process.env.HOME ?? '', '.foundry/bin')}:${process.env.PATH ?? ''}`,
    MOTORCOVE_RPC_URL: rpcUrl,
    MOTORCOVE_WORKSPACE_ROOT: directory,
    MOTORCOVE_ENV: environmentId,
  };
  const chain = defineChain({
    id: 31_337,
    name: 'MotorCove test',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  let anvil: ChildProcess;
  let manifest: DeploymentManifest;
  let snapshot: string;

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
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
      }
    }
    throw new Error('Anvil did not become ready');
  };

  const fundingEntry = (hash: Hash, values: Partial<JournalEntry> = {}): JournalEntry => {
    if (!manifest.demoAccounts) throw new Error('Missing demo accounts');
    return {
      schemaVersion: 1,
      clientOperationId: 'chain-recovery-operation',
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:00:00.000Z',
      deploymentId: manifest.deploymentId,
      chainId: Number(manifest.chainId),
      account: manifest.demoAccounts.buyer,
      protocolVersion: manifest.protocolVersion,
      action: 'FUND_SALE',
      saleId: '1',
      intendedContract: manifest.escrow.address,
      intendedCalldata: encodeFunctionData({
        abi: motorCoveEscrowAbi,
        functionName: 'fundSale',
        args: [1n],
      }),
      calldataSummary: 'FUND_SALE',
      valueWei: String(parseEther('1')),
      originalTxHash: hash,
      currentTxHash: hash,
      evidenceSource: 'WALLET_RETURNED',
      association: 'EXACT_SUBMISSION',
      status: 'SUBMITTED',
      ...values,
    };
  };

  const sendFunding = async (nonce: number, gasPrice: bigint): Promise<Hash> => {
    if (!manifest.demoAccounts) throw new Error('Missing demo accounts');
    const wallet = createWalletClient({
      chain,
      account: manifest.demoAccounts.buyer as Address,
      transport: http(rpcUrl),
    });
    return wallet.writeContract({
      address: manifest.escrow.address as Address,
      abi: motorCoveEscrowAbi,
      functionName: 'fundSale',
      args: [1n],
      value: parseEther('1'),
      nonce,
      gas: 150_000n,
      gasPrice,
    });
  };

  beforeAll(async () => {
    anvil = spawn(
      'anvil',
      ['--host', '127.0.0.1', '--port', '18547', '--chain-id', '31337', '--silent'],
      { cwd: root, env: environment, stdio: 'pipe' },
    );
    await waitForRpc();
    execFileSync('corepack', ['pnpm', '--filter', '@motorcove/indexer', 'bootstrap'], {
      cwd: root,
      env: environment,
      stdio: 'pipe',
    });
    manifest = deploymentManifestSchema.parse(
      JSON.parse(readFileSync(paths.deploymentPath, 'utf8')),
    );
  }, 60_000);

  beforeEach(async () => {
    snapshot = await rpc<string>('evm_snapshot');
  });

  afterEach(async () => {
    await rpc('evm_setAutomine', [true]);
    await rpc('evm_revert', [snapshot]);
  });

  afterAll(() => {
    anvil?.kill('SIGTERM');
    rmSync(directory, { recursive: true, force: true });
  });

  async function observeReplacement(replacement: 'REPRICED' | 'CANCELLED' | 'DIFFERENT_CALL') {
    if (!manifest.demoAccounts) throw new Error('Missing demo accounts');
    const buyer = manifest.demoAccounts.buyer as Address;
    const wallet = createWalletClient({ chain, account: buyer, transport: http(rpcUrl) });
    const nonce = await publicClient.getTransactionCount({ address: buyer, blockTag: 'pending' });
    await rpc('evm_setAutomine', [false]);
    const originalHash = await sendFunding(nonce, parseGwei('2'));
    const inspection = createFundingChainReader(publicClient).inspectFunding(
      fundingEntry(originalHash),
      originalHash,
    );
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300));

    let replacementHash: Hash;
    if (replacement === 'REPRICED') {
      replacementHash = await sendFunding(nonce, parseGwei('4'));
    } else if (replacement === 'CANCELLED') {
      replacementHash = await wallet.sendTransaction({
        to: buyer,
        value: 0n,
        nonce,
        gas: 21_000n,
        gasPrice: parseGwei('4'),
      });
    } else {
      replacementHash = await wallet.writeContract({
        address: manifest.escrow.address as Address,
        abi: motorCoveEscrowAbi,
        functionName: 'fundSale',
        args: [999n],
        value: parseEther('1'),
        nonce,
        gas: 150_000n,
        gasPrice: parseGwei('4'),
      });
    }
    await rpc('evm_mine');
    return { originalHash, replacementHash, inspected: await inspection };
  }

  it('classifies a same-intent fee bump as repriced and validates its funding event', async () => {
    const result = await observeReplacement('REPRICED');
    expect(result.inspected).toMatchObject({
      kind: 'INCLUDED_SUCCESS',
      transactionHash: result.replacementHash,
      replacementKind: 'REPRICED',
    });
  });

  it('classifies a self-send nonce replacement as cancelled', async () => {
    const result = await observeReplacement('CANCELLED');
    expect(result.inspected).toEqual({
      kind: 'REPLACED_OR_CANCELLED',
      transactionHash: result.originalHash,
      replacementHash: result.replacementHash,
      replacementKind: 'CANCELLED',
    });
  });

  it('classifies a different call at the same nonce without treating it as funding', async () => {
    const result = await observeReplacement('DIFFERENT_CALL');
    expect(result.inspected).toEqual({
      kind: 'REPLACED_OR_CANCELLED',
      transactionHash: result.originalHash,
      replacementHash: result.replacementHash,
      replacementKind: 'DIFFERENT_CALL',
    });
  });

  it('marks an orphaned inclusion noncanonical and revalidates the same hash when re-included', async () => {
    if (!manifest.demoAccounts) throw new Error('Missing demo accounts');
    const buyer = manifest.demoAccounts.buyer as Address;
    const nonce = await publicClient.getTransactionCount({ address: buyer, blockTag: 'pending' });
    const beforeFunding = await rpc<string>('evm_snapshot');
    const originalHash = await sendFunding(nonce, parseGwei('2'));
    const originalReceipt = await publicClient.waitForTransactionReceipt({ hash: originalHash });
    const saved = fundingEntry(originalHash, {
      status: 'INCLUDED_SUCCESS',
      receiptStatus: 'SUCCESS',
      receiptBlockNumber: String(originalReceipt.blockNumber),
      receiptBlockHash: originalReceipt.blockHash,
    });

    expect(await rpc<boolean>('evm_revert', [beforeFunding])).toBe(true);
    await rpc('evm_mine');
    expect(
      await createFundingChainReader(publicClient).inspectFunding(saved, originalHash),
    ).toEqual({ kind: 'NONCANONICAL', transactionHash: originalHash });

    const reIncludedHash = await sendFunding(nonce, parseGwei('2'));
    expect(reIncludedHash).toBe(originalHash);
    const reIncluded = await createFundingChainReader(publicClient).inspectFunding(
      { ...saved, status: 'ORPHANED' },
      originalHash,
    );
    expect(reIncluded).toMatchObject({
      kind: 'INCLUDED_SUCCESS',
      transactionHash: originalHash,
    });
    if (reIncluded.kind !== 'INCLUDED_SUCCESS') throw new Error('Expected re-inclusion');
    expect(reIncluded.blockHash).not.toBe(originalReceipt.blockHash);
  });
});
