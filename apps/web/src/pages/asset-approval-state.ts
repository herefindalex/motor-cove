import type { JournalEntry } from '../capabilities/transactions/index.js';
import type { ApprovalState } from '../features/marketplace/index.js';
import type { ChainApprovalState } from '../integrations/evm/use-token-approvals.js';

type ApprovalEntry = Pick<
  JournalEntry,
  'action' | 'tokenId' | 'deploymentId' | 'account' | 'updatedAt' | 'status'
>;

export function resolveAssetApprovalStates(
  tokenIds: readonly string[],
  chainApprovals: ReadonlyMap<string, ChainApprovalState>,
  entries: readonly ApprovalEntry[],
  deploymentId: string | undefined,
  account: string | undefined,
): ReadonlyMap<string, ApprovalState> {
  const states = new Map<string, ApprovalState>();
  for (const tokenId of tokenIds) {
    const chainState = chainApprovals.get(tokenId) ?? 'checking';
    const matchingApprovals = entries.filter(
      (entry) =>
        entry.action === 'APPROVE_TOKEN' &&
        entry.tokenId === tokenId &&
        entry.deploymentId === deploymentId &&
        entry.account.toLowerCase() === account?.toLowerCase(),
    );
    // An independent attempt has no monotonic ordering relative to another one.
    // A terminal entry must never hide an unresolved approval attempt.
    const unresolvedStatus = (
      [
        'UNKNOWN',
        'ORPHANED',
        'REPLACED_OR_CANCELLED',
        'INCLUDED_SUCCESS',
        'SUBMITTED',
        'AWAITING_WALLET',
        'PREPARING',
      ] as const
    ).find((status) => matchingApprovals.some((entry) => entry.status === status));
    states.set(
      tokenId,
      chainState === 'approved'
        ? 'approved'
        : unresolvedStatus === 'PREPARING'
          ? 'preparing'
          : unresolvedStatus === 'AWAITING_WALLET'
            ? 'awaiting-wallet'
            : unresolvedStatus === 'SUBMITTED'
              ? 'pending'
              : unresolvedStatus === 'UNKNOWN' ||
                  unresolvedStatus === 'ORPHANED' ||
                  unresolvedStatus === 'REPLACED_OR_CANCELLED'
                ? 'unknown'
                : unresolvedStatus === 'INCLUDED_SUCCESS'
                  ? 'included'
                  : chainState,
    );
  }
  return states;
}
