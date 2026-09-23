// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MyAssets } from './MyAssets.js';

const assets = [
  { tokenId: '1', name: 'Roadster', currentOwner: null },
  { tokenId: '2', name: 'Coupe', currentOwner: null },
];

afterEach(cleanup);

describe('MyAssets approval and listing workflow', () => {
  it('requires confirmed on-chain approval before enabling create sale', () => {
    const onApprove = vi.fn(async () => {});
    const onCreate = vi.fn(async () => {});
    const { rerender } = render(
      <MyAssets
        assets={[assets[0]!]}
        enabled
        approvalStates={new Map([['1', 'not-approved']])}
        onApprove={onApprove}
        onCreate={onCreate}
      />,
    );

    expect(screen.getByText('Not approved on-chain')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create sale' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalledWith('1');

    rerender(
      <MyAssets
        assets={[assets[0]!]}
        enabled
        approvalStates={new Map([['1', 'pending']])}
        onApprove={onApprove}
        onCreate={onCreate}
      />,
    );
    expect(screen.getByText('Approval submitted. Waiting for inclusion.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create sale' }).hasAttribute('disabled')).toBe(true);

    rerender(
      <MyAssets
        assets={[assets[0]!]}
        enabled
        approvalStates={new Map([['1', 'included']])}
        onApprove={onApprove}
        onCreate={onCreate}
      />,
    );
    expect(
      screen.getByText('Approval included, but current on-chain permission is not confirmed yet.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create sale' }).hasAttribute('disabled')).toBe(true);

    rerender(
      <MyAssets
        assets={[assets[0]!]}
        enabled
        approvalStates={new Map([['1', 'approved']])}
        onApprove={onApprove}
        onCreate={onCreate}
      />,
    );
    expect(screen.getByText('Approved on-chain')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create sale' }));
    expect(onCreate).toHaveBeenCalledWith('1', '1');
  });

  it('keeps price drafts per asset and shows action progress', () => {
    const onCreate = vi.fn(async () => {});
    const { rerender } = render(
      <MyAssets
        assets={assets}
        enabled
        approvalStates={
          new Map([
            ['1', 'approved'],
            ['2', 'approved'],
          ])
        }
        onApprove={vi.fn()}
        onCreate={onCreate}
      />,
    );
    fireEvent.change(screen.getByLabelText('Listing price for token #1 (test ETH)'), {
      target: { value: '0.5' },
    });
    fireEvent.change(screen.getByLabelText('Listing price for token #2 (test ETH)'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Create sale' })[1]!);
    expect(onCreate).toHaveBeenCalledWith('2', '2');

    rerender(
      <MyAssets
        assets={assets}
        enabled
        approvalStates={
          new Map([
            ['1', 'approved'],
            ['2', 'approved'],
          ])
        }
        pendingActionKeys={new Set(['CREATE_SALE:1', 'APPROVE_TOKEN:2'])}
        onApprove={vi.fn()}
        onCreate={onCreate}
      />,
    );
    const creating = screen.getByRole('button', { name: 'Creating…' });
    expect(creating.hasAttribute('disabled')).toBe(true);
    expect(creating.getAttribute('aria-busy')).toBe('true');
    const approving = screen.getByRole('button', { name: 'Approving…' });
    expect(approving.hasAttribute('disabled')).toBe(true);
    expect(approving.getAttribute('aria-busy')).toBe('true');
    const firstPrice = screen.getByLabelText('Listing price for token #1 (test ETH)');
    if (!(firstPrice instanceof HTMLInputElement)) throw new Error('PRICE_INPUT_MISSING');
    expect(firstPrice.value).toBe('0.5');
  });

  it('does not call actions while approval availability is unknown', () => {
    const onCreate = vi.fn(async () => {});
    render(
      <MyAssets
        assets={[assets[0]!]}
        enabled
        approvalStates={new Map([['1', 'unavailable']])}
        onApprove={vi.fn()}
        onCreate={onCreate}
      />,
    );
    expect(
      screen.getByText('Approval check unavailable. Try again when chain data returns.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create sale' }));
    expect(onCreate).not.toHaveBeenCalled();
  });
});
