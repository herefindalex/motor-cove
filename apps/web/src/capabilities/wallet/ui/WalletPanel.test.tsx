// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WalletPanel } from './WalletPanel.js';

const requiredProps = {
  pending: false,
  onConnect: vi.fn(),
  onDisconnect: vi.fn(),
  onSwitch: vi.fn(),
};

describe('WalletPanel', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('explains when no usable wallet provider exists instead of rendering a dead button', () => {
    render(<WalletPanel {...requiredProps} state={{ kind: 'unavailable' }} connectors={[]} />);

    expect(screen.getByRole('status').textContent).toContain('No injected wallet detected');
    expect(screen.queryByRole('button', { name: 'Connect wallet' })).toBeNull();
  });

  it('shows the expected local network and the connected account context', () => {
    const { rerender } = render(
      <WalletPanel
        {...requiredProps}
        state={{
          kind: 'wrong-network',
          account: `0x${'2'.repeat(40)}`,
          actualChainId: 1,
          requiredChainId: 31337,
        }}
        connectors={[]}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain('Expected local chain 31337');
    expect(screen.getByRole('button', { name: 'Switch to local chain' })).toBeTruthy();

    rerender(
      <WalletPanel
        {...requiredProps}
        state={{ kind: 'connected', account: `0x${'2'.repeat(40)}`, chainId: 31337 }}
        connectors={[]}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain('Connected · local chain 31337');
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy();
  });

  it('routes an explicit local demo role through the selected connector', () => {
    const onConnect = vi.fn();
    render(
      <WalletPanel
        {...requiredProps}
        state={{ kind: 'disconnected' }}
        connectors={[
          { id: 'seller-uid', buttonLabel: 'Use local seller' },
          { id: 'buyer-uid', buttonLabel: 'Use local buyer' },
        ]}
        onConnect={onConnect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use local buyer' }));
    expect(onConnect).toHaveBeenCalledOnce();
    expect(onConnect).toHaveBeenCalledWith('buyer-uid');
  });

  it('surfaces a connector failure next to the retry controls', () => {
    render(
      <WalletPanel
        {...requiredProps}
        state={{ kind: 'disconnected' }}
        connectors={[{ id: 'injected-uid', buttonLabel: 'Connect wallet' }]}
        error="Wallet connection failed"
      />,
    );

    expect(screen.getByRole('alert').textContent).toBe('Wallet connection failed');
  });
});
