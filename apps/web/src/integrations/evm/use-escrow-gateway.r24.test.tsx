// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicConfig } from '@motorcove/api-contracts';
import type { JournalEntry, TransactionJournal } from '../../capabilities/transactions/index.js';
import { useEscrowGateway } from './use-escrow-gateway.js';

const harness = vi.hoisted(() => ({
  account: `0x${'1'.repeat(40)}`,
  hash: `0x${'2'.repeat(64)}`,
  publicDeploymentId: `0x${'a'.repeat(64)}`,
  publicChainId: 31_337,
  walletDeploymentId: `0x${'a'.repeat(64)}`,
  writeContract: vi.fn(async () => `0x${'2'.repeat(64)}`),
  simulateContract: vi.fn(async () => ({})),
  readContract: vi.fn(async () => `0x${'a'.repeat(64)}`),
  walletRequest: vi.fn(async () => `0x${'a'.repeat(64)}`),
}));

vi.mock('wagmi', () => ({
  useWalletClient: () => ({
    data: {
      account: { address: harness.account },
      chain: { id: 31_337 },
      writeContract: harness.writeContract,
      request: harness.walletRequest,
    },
  }),
  usePublicClient: () => ({
    simulateContract: harness.simulateContract,
    getTransaction: vi.fn(async () => ({ nonce: 1 })),
    getChainId: vi.fn(async () => harness.publicChainId),
    readContract: harness.readContract,
  }),
}));

const config = (deploymentId: `0x${string}`): PublicConfig => ({
  deploymentId,
  chainId: '31337',
  protocolVersion: '0.2.0',
  nftAddress: `0x${'3'.repeat(40)}`,
  escrowAddress: `0x${'4'.repeat(40)}`,
  fundingPeriodSeconds: '300',
});

function journal(): TransactionJournal {
  const entries: JournalEntry[] = [];
  return {
    load: (deploymentId) => entries.filter((entry) => entry.deploymentId === deploymentId),
    loadIssues: () => [],
    save: async (entry) => {
      const index = entries.findIndex(
        (candidate) => candidate.clientOperationId === entry.clientOperationId,
      );
      const stored = { ...entry, revision: (entry.revision ?? 0) + 1 };
      if (index === -1) entries.push(stored);
      else entries[index] = stored;
      return stored;
    },
    saveVolatile: (entry) => entry,
    subscribe: () => () => undefined,
  };
}

describe('R24 provider-bound deployment generation proof', () => {
  const intended = `0x${'a'.repeat(64)}` as const;
  const replacement = `0x${'b'.repeat(64)}` as const;

  beforeEach(() => {
    harness.publicDeploymentId = intended;
    harness.publicChainId = 31_337;
    harness.walletDeploymentId = intended;
    harness.writeContract.mockClear();
    harness.simulateContract.mockClear();
    harness.readContract.mockReset();
    harness.readContract.mockImplementation(async () => harness.publicDeploymentId);
    harness.walletRequest.mockReset();
    harness.walletRequest.mockImplementation(async () => harness.walletDeploymentId);
  });

  afterEach(cleanup);

  it('does not write when the public RPC is on another chain', async () => {
    harness.publicChainId = 1;
    const { result } = renderHook(() => useEscrowGateway(config(intended), journal()));
    if (!result.current) throw new Error('Expected gateway');

    await act(async () => {
      await expect(result.current!.fundSale(1n, 10n)).resolves.toMatchObject({
        kind: 'failed',
        message: 'OPERATION_ENVIRONMENT_MISMATCH',
      });
    });

    expect(harness.writeContract).not.toHaveBeenCalled();
    expect(harness.walletRequest).not.toHaveBeenCalled();
  });

  it('does not write when the public RPC belongs to another deployment generation', async () => {
    harness.publicDeploymentId = replacement;
    const { result } = renderHook(() => useEscrowGateway(config(intended), journal()));
    if (!result.current) throw new Error('Expected gateway');

    await act(async () => {
      await expect(result.current!.fundSale(1n, 10n)).resolves.toMatchObject({
        kind: 'failed',
        message: 'OPERATION_ENVIRONMENT_MISMATCH',
      });
    });

    expect(harness.writeContract).not.toHaveBeenCalled();
  });

  it('does not write when the wallet provider belongs to another deployment generation', async () => {
    harness.walletDeploymentId = replacement;
    const { result } = renderHook(() => useEscrowGateway(config(intended), journal()));
    if (!result.current) throw new Error('Expected gateway');

    await act(async () => {
      await expect(result.current!.fundSale(1n, 10n)).resolves.toMatchObject({
        kind: 'failed',
        message: 'OPERATION_ENVIRONMENT_MISMATCH',
      });
    });

    expect(harness.walletRequest).toHaveBeenCalled();
    expect(harness.writeContract).not.toHaveBeenCalled();
  });

  it('does not write when the wallet provider returns malformed deployment evidence', async () => {
    harness.walletRequest.mockResolvedValueOnce('0x12');
    const { result } = renderHook(() => useEscrowGateway(config(intended), journal()));
    if (!result.current) throw new Error('Expected gateway');
    await act(async () => {
      await expect(result.current!.fundSale(1n, 10n)).resolves.toMatchObject({
        kind: 'failed',
        message: 'OPERATION_ENVIRONMENT_MISMATCH',
      });
    });
    expect(harness.writeContract).not.toHaveBeenCalled();
  });

  it('writes once when both read paths prove the intended deployment', async () => {
    const { result } = renderHook(() => useEscrowGateway(config(intended), journal()));
    if (!result.current) throw new Error('Expected gateway');

    await act(async () => {
      await expect(result.current!.fundSale(1n, 10n)).resolves.toMatchObject({
        kind: 'submitted',
        hash: harness.hash,
      });
    });

    expect(harness.readContract).toHaveBeenCalled();
    expect(harness.walletRequest).toHaveBeenCalled();
    expect(harness.writeContract).toHaveBeenCalledOnce();
  });
});
