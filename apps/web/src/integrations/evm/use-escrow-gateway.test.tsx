// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicConfig } from '@motorcove/api-contracts';
import type { JournalEntry, TransactionJournal } from '../../capabilities/transactions/index.js';
import { useEscrowGateway } from './use-escrow-gateway.js';

const account = `0x${'1'.repeat(40)}` as const;
const hash = `0x${'2'.repeat(64)}` as const;
const writeContract = vi.fn(async () => hash);
const simulateContract = vi.fn(async () => ({}));

vi.mock('wagmi', () => ({
  useWalletClient: () => ({
    data: {
      account: { address: account },
      chain: { id: 31_337 },
      writeContract,
    },
  }),
  usePublicClient: () => ({
    simulateContract,
    getTransaction: vi.fn(async () => ({ nonce: 1 })),
  }),
}));

const config = (digit: string): PublicConfig => ({
  deploymentId: `0x${digit.repeat(64)}`,
  chainId: '31337',
  protocolVersion: '0.1.0',
  nftAddress: `0x${digit.repeat(40)}`,
  escrowAddress: `0x${digit.repeat(40)}`,
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
      if (index === -1) entries.push(entry);
      else entries[index] = entry;
    },
    saveVolatile: (entry) => {
      const index = entries.findIndex(
        (candidate) => candidate.clientOperationId === entry.clientOperationId,
      );
      if (index === -1) entries.push(entry);
      else entries[index] = entry;
    },
    subscribe: () => () => {},
  };
}

afterEach(() => {
  cleanup();
  writeContract.mockClear();
  simulateContract.mockReset();
  simulateContract.mockResolvedValue({});
});

describe('useEscrowGateway live deployment context', () => {
  it('invalidates an old action after deployment replacement and allows the new action', async () => {
    let releaseSimulation: (() => void) | undefined;
    simulateContract.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseSimulation = () => resolve({});
        }),
    );
    const transactionJournal = journal();
    const first = config('3');
    const second = config('4');
    const { result, rerender } = renderHook(
      ({ activeConfig }) => useEscrowGateway(activeConfig, transactionJournal),
      { initialProps: { activeConfig: first } },
    );

    const oldGateway = result.current;
    if (!oldGateway) throw new Error('Expected first gateway');
    const oldSubmission = oldGateway.fundSale(1n, 10n);
    await vi.waitFor(() => expect(simulateContract).toHaveBeenCalledTimes(1));

    rerender({ activeConfig: second });
    releaseSimulation?.();

    await expect(oldSubmission).resolves.toMatchObject({
      kind: 'failed',
      message: 'OPERATION_CONTEXT_CHANGED',
    });
    expect(writeContract).not.toHaveBeenCalled();
    expect(transactionJournal.load(first.deploymentId).at(-1)).toMatchObject({
      deploymentId: first.deploymentId,
      intendedContract: first.escrowAddress,
      status: 'FAILED_BEFORE_SUBMIT',
      lastErrorCategory: 'OPERATION_CONTEXT_CHANGED',
    });

    const newGateway = result.current;
    if (!newGateway) throw new Error('Expected replacement gateway');
    await act(async () => {
      await expect(newGateway.fundSale(1n, 10n)).resolves.toMatchObject({
        kind: 'submitted',
        hash,
      });
    });
    expect(writeContract).toHaveBeenCalledTimes(1);
    expect(writeContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ address: second.escrowAddress }),
    );
  });
});
