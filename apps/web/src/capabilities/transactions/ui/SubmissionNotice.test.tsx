// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SubmissionNotice } from './SubmissionNotice.js';

describe('SubmissionNotice', () => {
  afterEach(cleanup);

  it('distinguishes submitted, rejected, unknown, and failed outcomes', () => {
    const hash = `0x${'5'.repeat(64)}` as const;
    const { rerender } = render(
      <SubmissionNotice result={{ kind: 'submitted', hash, clientOperationId: 'operation-1' }} />,
    );
    expect(screen.getByRole('status').textContent).toContain(
      'Transaction submitted. Check the timeline for its latest status.',
    );
    expect(screen.getByRole('status').textContent).toContain(hash);

    rerender(
      <SubmissionNotice
        result={{ kind: 'rejected', clientOperationId: 'operation-1', durable: true }}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain(
      'No transaction submission was confirmed.',
    );

    rerender(
      <SubmissionNotice
        result={{ kind: 'unknown', clientOperationId: 'operation-1', durable: true }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Check wallet activity before trying again.',
    );

    rerender(
      <SubmissionNotice
        result={{ kind: 'failed', clientOperationId: 'operation-1', message: 'simulation failed' }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('simulation failed');
  });

  it('shows the known hash and non-durable recovery warning', () => {
    const hash = `0x${'4'.repeat(64)}` as const;
    render(
      <SubmissionNotice
        result={{ kind: 'submitted-non-durable', hash, clientOperationId: 'operation-1' }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain(hash);
    expect(screen.getByRole('button', { name: 'Copy transaction hash' })).toBeTruthy();
    expect(screen.getByText(/journal could not persist it/i)).toBeTruthy();
  });

  it('shows a durable-intent failure caught before wallet submission', () => {
    render(<SubmissionNotice error="storage unavailable" />);
    expect(screen.getByText('storage unavailable')).toBeTruthy();
  });

  it('warns when a wallet rejection could only be retained in this tab', () => {
    render(
      <SubmissionNotice
        result={{ kind: 'rejected', clientOperationId: 'operation-1', durable: false }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('available only in this tab');
  });
});
