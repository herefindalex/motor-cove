import { describe, expect, it } from 'vitest';
import type { JournalEntry } from '../capabilities/transactions/index.js';
import { resolveAssetApprovalStates } from './asset-approval-state.js';

const deploymentId = `0x${'1'.repeat(64)}`;
const account = `0x${'2'.repeat(40)}`;
type ApprovalEntry = Pick<
  JournalEntry,
  'action' | 'tokenId' | 'deploymentId' | 'account' | 'updatedAt' | 'status'
>;

function approval(status: JournalEntry['status'], updatedAt: string): ApprovalEntry {
  return { action: 'APPROVE_TOKEN', tokenId: '1', deploymentId, account, status, updatedAt };
}

function state(entries: ApprovalEntry[], chainState: 'not-approved' | 'approved' = 'not-approved') {
  return resolveAssetApprovalStates(
    ['1'],
    new Map([['1', chainState]]),
    entries,
    deploymentId,
    account,
  ).get('1');
}

describe('R27 approval attempt evidence', () => {
  it('keeps an unresolved submission gated when a terminal attempt has the later wall clock', () => {
    expect(
      state([
        approval('REJECTED', '2026-09-23T12:00:01.000Z'),
        approval('SUBMITTED', '2026-09-23T11:59:59.000Z'),
      ]),
    ).toBe('pending');
  });

  it.each([
    ['PREPARING', 'preparing'],
    ['AWAITING_WALLET', 'awaiting-wallet'],
    ['SUBMITTED', 'pending'],
    ['UNKNOWN', 'unknown'],
    ['ORPHANED', 'unknown'],
    ['REPLACED_OR_CANCELLED', 'unknown'],
    ['INCLUDED_SUCCESS', 'included'],
  ] as const)('preserves unresolved %s behind a newer terminal timestamp', (status, expected) => {
    expect(
      state([
        approval('FAILED_BEFORE_SUBMIT', '2026-09-23T12:00:01.000Z'),
        approval(status, '2026-09-23T11:59:59.000Z'),
      ]),
    ).toBe(expected);
  });

  it('allows current chain approval proof to override older local uncertainty', () => {
    expect(state([approval('UNKNOWN', '2026-09-23T11:59:59.000Z')], 'approved')).toBe('approved');
  });
});
