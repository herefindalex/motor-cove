// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicConfig } from '@motorcove/api-contracts';
import { useTokenApprovals } from './use-token-approvals.js';

const rpc = vi.hoisted(() => ({
  getChainId: vi.fn(async () => 31_337),
  getBlock: vi.fn(async () => ({ number: 5n, hash: `0x${'a'.repeat(64)}`, timestamp: 100n })),
  readContract: vi.fn(),
}));
vi.mock('wagmi', () => ({ usePublicClient: () => rpc }));

const account = `0x${'2'.repeat(40)}` as const;
const config: PublicConfig = {
  deploymentId: `0x${'1'.repeat(64)}`,
  chainId: '31337',
  protocolVersion: '0.2.0',
  nftAddress: `0x${'3'.repeat(40)}`,
  escrowAddress: `0x${'4'.repeat(40)}`,
  fundingPeriodSeconds: '300',
};
let queryClient: QueryClient;
function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  rpc.getChainId.mockResolvedValue(31_337);
  rpc.getBlock.mockResolvedValue({ number: 5n, hash: `0x${'a'.repeat(64)}`, timestamp: 100n });
  rpc.readContract.mockReset();
});
afterEach(cleanup);

describe('R27 approval read deployment identity', () => {
  it('withholds approval when the same chain and addresses now belong to another deployment', async () => {
    rpc.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'deploymentId') return `0x${'9'.repeat(64)}`;
      if (functionName === 'ownerOf') return account;
      if (functionName === 'getApproved') return config.escrowAddress;
      return false;
    });
    const { result } = renderHook(() => useTokenApprovals(config, account, ['1']), { wrapper });
    await waitFor(() => expect(result.current.get('1')).toBe('unavailable'));
    expect(rpc.readContract).not.toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'ownerOf' }),
    );
  });

  it('publishes approval only after matching generation proof', async () => {
    rpc.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'deploymentId') return config.deploymentId;
      if (functionName === 'ownerOf') return account;
      if (functionName === 'getApproved') return config.escrowAddress;
      return false;
    });
    const { result } = renderHook(() => useTokenApprovals(config, account, ['1']), { wrapper });
    await waitFor(() => expect(result.current.get('1')).toBe('approved'));
    expect(rpc.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'deploymentId', address: config.escrowAddress }),
    );
    expect(rpc.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'getApproved', blockNumber: 5n }),
    );
  });

  it('rejects a block replacement during the approval observation', async () => {
    rpc.getBlock
      .mockResolvedValueOnce({ number: 5n, hash: `0x${'a'.repeat(64)}`, timestamp: 100n })
      .mockResolvedValueOnce({ number: 5n, hash: `0x${'b'.repeat(64)}`, timestamp: 100n });
    rpc.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'deploymentId') return config.deploymentId;
      if (functionName === 'ownerOf') return account;
      if (functionName === 'getApproved') return config.escrowAddress;
      return false;
    });
    const { result } = renderHook(() => useTokenApprovals(config, account, ['1']), { wrapper });
    await waitFor(() => expect(result.current.get('1')).toBe('unavailable'));
  });
});
