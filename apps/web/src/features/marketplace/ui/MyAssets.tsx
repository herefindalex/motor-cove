import { useState } from 'react';

interface Asset {
  tokenId: string;
  name: string;
  currentOwner: string | null;
}

export type ApprovalState =
  | 'checking'
  | 'not-approved'
  | 'preparing'
  | 'awaiting-wallet'
  | 'pending'
  | 'included'
  | 'approved'
  | 'owner-mismatch'
  | 'unknown'
  | 'unavailable';

const approvalMessage: Record<ApprovalState, string> = {
  checking: 'Checking on-chain approval…',
  'not-approved': 'Not approved on-chain',
  preparing: 'Preparing approval request.',
  'awaiting-wallet': 'Waiting for the wallet approval request.',
  pending: 'Approval submitted. Waiting for inclusion.',
  included: 'Approval included, but current on-chain permission is not confirmed yet.',
  approved: 'Approved on-chain',
  'owner-mismatch':
    'Chain ownership differs from this indexed asset. Wait for marketplace data to sync.',
  unknown: 'Approval outcome unknown. Check wallet activity before trying again.',
  unavailable: 'Approval check unavailable. Try again when chain data returns.',
};

export function MyAssets({
  assets,
  enabled,
  loading = false,
  approvalStates,
  pendingActionKeys,
  onApprove,
  onCreate,
}: {
  assets: readonly Asset[];
  enabled: boolean;
  loading?: boolean;
  approvalStates: ReadonlyMap<string, ApprovalState>;
  pendingActionKeys?: ReadonlySet<string>;
  onApprove(tokenId: string): Promise<void>;
  onCreate(tokenId: string, priceEth: string): Promise<void>;
}) {
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});

  return (
    <section>
      <h2>My assets</h2>
      <p>
        Approval and listing are separate transactions. Create a sale after on-chain approval is
        confirmed.
      </p>
      {loading ? (
        <p role="status">Loading owned vehicles…</p>
      ) : assets.length === 0 ? (
        <p className="empty">Connect the seeded seller account to list an unescrowed asset.</p>
      ) : (
        <div className="assets">
          {assets.map((asset) => {
            const approval = approvalStates.get(asset.tokenId) ?? 'checking';
            const approving = pendingActionKeys?.has(`APPROVE_TOKEN:${asset.tokenId}`) ?? false;
            const creating = pendingActionKeys?.has(`CREATE_SALE:${asset.tokenId}`) ?? false;
            const canApprove = enabled && approval === 'not-approved' && !approving && !creating;
            const canCreate = enabled && approval === 'approved' && !approving && !creating;
            const price = priceDrafts[asset.tokenId] ?? '1';

            return (
              <article className="asset" key={asset.tokenId}>
                <div className="asset-identity">
                  <h3>{asset.name}</h3>
                  <span>Token #{asset.tokenId}</span>
                </div>
                <p className="asset-status" role="status">
                  {approvalMessage[approval]}
                </p>
                <label>
                  Listing price for token #{asset.tokenId} (test ETH)
                  <input
                    value={price}
                    disabled={creating}
                    onChange={(event) =>
                      setPriceDrafts((current) => ({
                        ...current,
                        [asset.tokenId]: event.target.value,
                      }))
                    }
                    inputMode="decimal"
                  />
                </label>
                <div className="asset-actions">
                  <button
                    type="button"
                    disabled={!canApprove}
                    aria-busy={approving}
                    onClick={() => void onApprove(asset.tokenId)}
                  >
                    {approving ? 'Approving…' : approval === 'approved' ? 'Approved' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    disabled={!canCreate}
                    aria-busy={creating}
                    onClick={() => void onCreate(asset.tokenId, price)}
                  >
                    {creating ? 'Creating…' : 'Create sale'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
