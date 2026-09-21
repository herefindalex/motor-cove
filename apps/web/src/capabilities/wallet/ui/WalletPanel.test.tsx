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
