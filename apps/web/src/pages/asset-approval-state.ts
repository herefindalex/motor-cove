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
    const latestApproval = entries
      .filter(
        (entry) =>
          entry.action === 'APPROVE_TOKEN' &&
          entry.tokenId === tokenId &&
          entry.deploymentId === deploymentId &&
          entry.account.toLowerCase() === account?.toLowerCase(),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    const unknown =
      latestApproval &&
      ['UNKNOWN', 'ORPHANED', 'REPLACED_OR_CANCELLED'].includes(latestApproval.status);
    states.set(
      tokenId,
      chainState === 'approved'
        ? 'approved'
        : latestApproval?.status === 'PREPARING'
          ? 'preparing'
          : latestApproval?.status === 'AWAITING_WALLET'
            ? 'awaiting-wallet'
            : latestApproval?.status === 'SUBMITTED'
              ? 'pending'
              : unknown
                ? 'unknown'
                : latestApproval?.status === 'INCLUDED_SUCCESS' && chainState === 'checking'
                  ? 'included'
                  : chainState,
    );
  }
  return states;
}
