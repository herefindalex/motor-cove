import { describe, expect, it } from 'vitest';
import type { JournalEntry } from '../capabilities/transactions/index.js';
import { resolveAssetApprovalStates } from './asset-approval-state.js';

const deploymentId = `0x${'1'.repeat(64)}`;
const account = `0x${'2'.repeat(40)}`;
type ApprovalEntry = Pick<
  JournalEntry,
  'action' | 'tokenId' | 'deploymentId' | 'account' | 'updatedAt' | 'status'
>;
const entry = (
  status: JournalEntry['status'],
  overrides: Partial<ApprovalEntry> = {},
): ApprovalEntry => ({
  action: 'APPROVE_TOKEN',
  tokenId: '1',
  deploymentId,
  account,
  updatedAt: '2026-09-22T00:00:00.000Z',
  status,
  ...overrides,
});

describe('asset approval presentation', () => {
  it('keeps a submitted or unknown wallet outcome distinct from permission', () => {
    expect(
      resolveAssetApprovalStates(
        ['1'],
        new Map([['1', 'not-approved']]),
        [entry('AWAITING_WALLET')],
        deploymentId,
        account,
      ).get('1'),
    ).toBe('awaiting-wallet');
    expect(
      resolveAssetApprovalStates(
        ['1'],
        new Map([['1', 'not-approved']]),
        [entry('SUBMITTED')],
        deploymentId,
        account,
      ).get('1'),
    ).toBe('pending');
    expect(
      resolveAssetApprovalStates(
        ['1'],
        new Map([['1', 'not-approved']]),
        [entry('UNKNOWN')],
        deploymentId,
        account,
      ).get('1'),
    ).toBe('unknown');
  });

  it('requires the chain read after inclusion and ignores other deployment evidence', () => {
    const entries = [
      entry('INCLUDED_SUCCESS'),
      entry('SUBMITTED', { deploymentId: `0x${'9'.repeat(64)}` }),
    ];
    expect(
      resolveAssetApprovalStates(
        ['1'],
        new Map([['1', 'checking']]),
        entries,
        deploymentId,
        account,
      ).get('1'),
    ).toBe('included');
    expect(
      resolveAssetApprovalStates(
        ['1'],
        new Map([['1', 'not-approved']]),
        entries,
        deploymentId,
        account,
      ).get('1'),
    ).toBe('not-approved');
    expect(
      resolveAssetApprovalStates(
        ['1'],
        new Map([['1', 'approved']]),
        entries,
        deploymentId,
        account,
      ).get('1'),
    ).toBe('approved');
  });

  it('does not use another account or older attempt to claim the current one is pending', () => {
    const entries = [
      entry('SUBMITTED', { account: `0x${'8'.repeat(40)}` }),
      entry('SUBMITTED', { updatedAt: '2026-09-20T00:00:00.000Z' }),
      entry('REJECTED', { updatedAt: '2026-09-22T00:00:01.000Z' }),
    ];
    expect(
      resolveAssetApprovalStates(
        ['1'],
        new Map([['1', 'not-approved']]),
        entries,
        deploymentId,
        account,
      ).get('1'),
    ).toBe('not-approved');
  });
});
