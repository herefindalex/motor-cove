// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SubmissionNotice } from './SubmissionNotice.js';

describe('SubmissionNotice', () => {
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
});
