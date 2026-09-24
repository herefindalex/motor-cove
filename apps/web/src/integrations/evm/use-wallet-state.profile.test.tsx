// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as wagmi from 'wagmi';
import { createMotorCoveWagmiConfig } from '../../app/web-chain-config.js';
import { useWalletState } from './use-wallet-state.js';

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof wagmi>();
  return {
    ...actual,
    useAccount: vi.fn(),
    useConnectors: vi.fn(),
    useConnect: vi.fn(),
    useDisconnect: vi.fn(),
    useSwitchChain: vi.fn(),
    useConfig: vi.fn(),
  };
});

const switchChain = vi.fn();

beforeEach(() => {
  const config = createMotorCoveWagmiConfig({
    chainId: 31_337,
    rpcUrl: 'http://127.0.0.1:8545',
    demoWalletEnabled: false,
  });
  vi.mocked(wagmi.useConfig).mockReturnValue(config);
  vi.mocked(wagmi.useAccount).mockReturnValue({
    address: `0x${'1'.repeat(40)}`,
    chainId: 31_337,
  } as ReturnType<typeof wagmi.useAccount>);
  vi.mocked(wagmi.useConnectors).mockReturnValue([]);
  vi.mocked(wagmi.useConnect).mockReturnValue({
    reset: vi.fn(),
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof wagmi.useConnect>);
  vi.mocked(wagmi.useDisconnect).mockReturnValue({
    disconnect: vi.fn(),
  } as unknown as ReturnType<typeof wagmi.useDisconnect>);
  vi.mocked(wagmi.useSwitchChain).mockReturnValue({
    chains: config.chains,
    switchChain,
    isPending: false,
  } as unknown as ReturnType<typeof wagmi.useSwitchChain>);
  switchChain.mockClear();
});

describe('wallet network switch profile boundary', () => {
  it('never requests an API chain that the Web config did not register', () => {
    const { result } = renderHook(() => useWalletState(1));
    result.current.switchNetwork();
    expect(switchChain).not.toHaveBeenCalled();
  });

  it('requests a registered chain', () => {
    const { result } = renderHook(() => useWalletState(31_337));
    result.current.switchNetwork();
    expect(switchChain).toHaveBeenCalledWith({ chainId: 31_337 });
  });
});
