// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicConfig } from '@motorcove/api-contracts';
import { useChainTime } from './use-chain-time.js';

const rpc = vi.hoisted(() => ({
  getChainId: vi.fn(async () => 31_337),
  getBlock: vi.fn(async () => ({ number: 5n, hash: `0x${'a'.repeat(64)}`, timestamp: 123n })),
  readContract: vi.fn(),
}));
vi.mock('wagmi', () => ({ usePublicClient: () => rpc }));

const config: PublicConfig = {
  deploymentId: `0x${'1'.repeat(64)}`,
  chainId: '31337',
  protocolVersion: '0.1.0',
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
  rpc.getBlock.mockResolvedValue({ number: 5n, hash: `0x${'a'.repeat(64)}`, timestamp: 123n });
  rpc.readContract.mockReset();
});
afterEach(cleanup);

describe('R27 chain time deployment identity', () => {
  it('does not publish a timestamp from another deployment on the same chain', async () => {
    rpc.readContract.mockResolvedValue(`0x${'9'.repeat(64)}`);
    const { result } = renderHook(() => useChainTime(config), { wrapper });
    await waitFor(() => expect(rpc.getBlock).toHaveBeenCalled());
    await waitFor(() =>
      expect(rpc.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: 'deploymentId', address: config.escrowAddress }),
      ),
    );
    expect(result.current).toBeUndefined();
  });

  it('drops previously verified time when later generation proof fails', async () => {
    rpc.readContract.mockResolvedValue(config.deploymentId);
    const { result } = renderHook(() => useChainTime(config), { wrapper });
    await waitFor(() => expect(result.current).toBe(123));
    rpc.readContract.mockResolvedValue(`0x${'9'.repeat(64)}`);
    await queryClient.invalidateQueries({ queryKey: ['chain-time'] });
    await waitFor(() => expect(result.current).toBeUndefined());
  });
});
