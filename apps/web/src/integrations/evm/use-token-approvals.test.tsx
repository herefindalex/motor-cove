// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicConfig } from '@motorcove/api-contracts';
import { useTokenApprovals } from './use-token-approvals.js';

const rpc = vi.hoisted(() => ({
  getChainId: vi.fn(async () => 31_337),
  getBlock: vi.fn(async () => ({ number: 5n, hash: `0x${'a'.repeat(64)}` })),
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

let client: QueryClient;
function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  rpc.getChainId.mockResolvedValue(31_337);
  rpc.getBlock.mockResolvedValue({ number: 5n, hash: `0x${'a'.repeat(64)}` });
  rpc.readContract.mockReset();
});
afterEach(cleanup);

describe('token approval reads', () => {
  it('reports permission only after a matching on-chain approval read', async () => {
    rpc.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'deploymentId') return config.deploymentId;
      if (functionName === 'ownerOf') return account;
      return functionName === 'getApproved' ? config.escrowAddress : false;
    });
    const { result } = renderHook(() => useTokenApprovals(config, account, ['1']), { wrapper });
    await waitFor(() => expect(result.current.get('1')).toBe('approved'));
    expect(rpc.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'getApproved', args: [1n] }),
    );
  });

  it('accepts an ERC-721 operator approval', async () => {
    rpc.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'deploymentId') return config.deploymentId;
      if (functionName === 'ownerOf') return account;
      return functionName === 'getApproved' ? `0x${'0'.repeat(40)}` : true;
    });
    const { result } = renderHook(() => useTokenApprovals(config, account, ['2']), { wrapper });
    await waitFor(() => expect(result.current.get('2')).toBe('approved'));
  });

  it('keeps create-sale permission closed when both approval reads are negative', async () => {
    rpc.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'deploymentId') return config.deploymentId;
      if (functionName === 'ownerOf') return account;
      return functionName === 'getApproved' ? `0x${'0'.repeat(40)}` : false;
    });
    const { result } = renderHook(() => useTokenApprovals(config, account, ['2']), { wrapper });
    await waitFor(() => expect(result.current.get('2')).toBe('not-approved'));
  });

  it('does not claim approval when RPC identity differs', async () => {
    rpc.getChainId.mockResolvedValue(1);
    const { result } = renderHook(() => useTokenApprovals(config, account, ['1']), { wrapper });
    await waitFor(() => expect(result.current.get('1')).toBe('unavailable'));
    expect(rpc.readContract).not.toHaveBeenCalled();
  });

  it('rejects a stale indexed owner even if the token has an escrow approval', async () => {
    rpc.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'deploymentId') return config.deploymentId;
      if (functionName === 'ownerOf') return `0x${'9'.repeat(40)}`;
      return functionName === 'getApproved' ? config.escrowAddress : false;
    });
    const { result } = renderHook(() => useTokenApprovals(config, account, ['1']), { wrapper });
    await waitFor(() => expect(result.current.get('1')).toBe('owner-mismatch'));
  });

  it('rereads permission when receipt evidence advances', async () => {
    let approved = false;
    rpc.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'deploymentId') return config.deploymentId;
      if (functionName === 'ownerOf') return account;
      if (functionName === 'getApproved')
        return approved ? config.escrowAddress : `0x${'0'.repeat(40)}`;
      return false;
    });
    const { result, rerender } = renderHook(
      ({ revision }) => useTokenApprovals(config, account, ['1'], revision),
      { initialProps: { revision: 'submitted' }, wrapper },
    );
    await waitFor(() => expect(result.current.get('1')).toBe('not-approved'));
    approved = true;
    rerender({ revision: 'included' });
    await waitFor(() => expect(result.current.get('1')).toBe('approved'));
  });
});
