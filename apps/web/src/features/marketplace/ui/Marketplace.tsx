import type { SaleResponse } from '@motorcove/api-contracts';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatWeiAsEth } from '../../trading/index.js';

interface Vehicle {
  tokenId: string | null;
  name: string;
  description: string;
  imagePath: string;
  currentOwner: string | null;
}
export interface MarketActions {
  fund(sale: SaleResponse): Promise<void>;
  complete(sale: SaleResponse): Promise<void>;
  cancel(sale: SaleResponse): Promise<void>;
  expire(sale: SaleResponse): Promise<void>;
  withdraw(sale: SaleResponse): Promise<void>;
  reclaim(sale: SaleResponse): Promise<void>;
}
const same = (left: string | null | undefined, right: string | null | undefined) =>
  Boolean(left && right && left.toLowerCase() === right.toLowerCase());
export function Marketplace({
  sales,
  vehicles,
  account,
  actions,
  pendingActionKeys,
  loading = false,
  provenance,
  currentTimestamp,
}: {
  sales: readonly SaleResponse[];
  vehicles: readonly Vehicle[];
  account: string | undefined;
  actions: MarketActions | undefined;
  pendingActionKeys?: ReadonlySet<string> | undefined;
  loading?: boolean | undefined;
  provenance: ReactNode;
  currentTimestamp: number | undefined;
}) {
  const byToken = new Map(vehicles.map((vehicle) => [vehicle.tokenId, vehicle]));
  return (
    <section>
      <div className="section-title">
        <div>
          <h2>Marketplace</h2>
          <p>Contract events projected through the local indexer.</p>
        </div>
        {provenance}
      </div>
      {loading ? (
        <p role="status">Loading projected listings…</p>
      ) : sales.length === 0 ? (
        <p className="empty">No projected listings.</p>
      ) : (
        <div className="cards">
          {sales.map((sale) => {
            const vehicle = byToken.get(sale.tokenId);
            const pending = (action: string) =>
              pendingActionKeys?.has(`${action}:${sale.saleId}`) ?? false;
            const expired =
              sale.expiresAt && currentTimestamp !== undefined
                ? currentTimestamp >= Number(sale.expiresAt)
                : false;
            return (
              <article className="card" key={sale.saleId}>
                <div className="vehicle-art" aria-hidden="true">
                  MCV·{sale.tokenId}
                </div>
                <div>
                  <span className={`badge ${sale.status.toLowerCase()}`}>{sale.status}</span>
                  <h3>
                    <Link to={`/sales/${sale.saleId}`}>
                      {vehicle?.name ?? `Vehicle #${sale.tokenId}`}
                    </Link>
                  </h3>
                  <p>{vehicle?.description}</p>
                  <dl>
                    <dt>Price</dt>
                    <dd>{formatWeiAsEth(sale.priceWei)}</dd>
                    <dt>Seller</dt>
                    <dd>
                      <code>{sale.seller.slice(0, 8)}…</code>
                    </dd>
                    <dt>Reserved for</dt>
                    <dd>
                      {sale.allowedBuyer ? (
                        <code>{sale.allowedBuyer}</code>
                      ) : (
                        'Unknown (legacy sale)'
                      )}
                    </dd>
                    {sale.buyer && (
                      <>
                        <dt>Buyer</dt>
                        <dd>
                          <code>{sale.buyer.slice(0, 8)}…</code>
                        </dd>
                      </>
                    )}
                  </dl>
                  {sale.claim && (
                    <p>
                      <strong>
                        {sale.claim.kind === 'BUYER_REFUND' ? 'Buyer refund' : 'Seller payment'}:
                      </strong>{' '}
                      {sale.claim.status}
                    </p>
                  )}
                  <div className="actions">
                    {sale.status === 'LISTED' && !same(account, sale.seller) && (
                      <button
                        disabled={
                          !actions || !same(account, sale.allowedBuyer) || pending('FUND_SALE')
                        }
                        aria-busy={pending('FUND_SALE')}
                        onClick={() => void actions?.fund(sale)}
                      >
                        {pending('FUND_SALE') ? 'Funding…' : 'Fund exactly'}
                      </button>
                    )}
                    {sale.status === 'LISTED' &&
                      !same(account, sale.seller) &&
                      !same(account, sale.allowedBuyer) && (
                        <p className="notice">Only the reserved buyer can fund this sale.</p>
                      )}
                    {sale.status === 'LISTED' && same(account, sale.seller) && (
                      <button
                        disabled={!actions || pending('CANCEL_SALE')}
                        aria-busy={pending('CANCEL_SALE')}
                        onClick={() => void actions?.cancel(sale)}
                      >
                        {pending('CANCEL_SALE') ? 'Cancelling…' : 'Cancel listing'}
                      </button>
                    )}
                    {sale.status === 'FUNDED' && same(account, sale.buyer) && !expired && (
                      <button
                        disabled={!actions || pending('COMPLETE_SALE')}
                        aria-busy={pending('COMPLETE_SALE')}
                        onClick={() => void actions?.complete(sale)}
                      >
                        {pending('COMPLETE_SALE') ? 'Completing…' : 'Complete sale'}
                      </button>
                    )}
                    {sale.status === 'FUNDED' && expired && (
                      <button
                        disabled={!actions || pending('EXPIRE_SALE')}
                        aria-busy={pending('EXPIRE_SALE')}
                        onClick={() => void actions?.expire(sale)}
                      >
                        {pending('EXPIRE_SALE') ? 'Expiring…' : 'Execute expiry'}
                      </button>
                    )}
                    {sale.claim?.status === 'CLAIMABLE' &&
                      same(account, sale.claim.beneficiary) && (
                        <button
                          disabled={!actions || pending('WITHDRAW_PAYMENT')}
                          aria-busy={pending('WITHDRAW_PAYMENT')}
                          onClick={() => void actions?.withdraw(sale)}
                        >
                          {pending('WITHDRAW_PAYMENT')
                            ? 'Withdrawing…'
                            : sale.claim.kind === 'BUYER_REFUND'
                              ? 'Withdraw refund'
                              : 'Withdraw proceeds'}
                        </button>
                      )}
                    {(sale.status === 'CANCELLED' || sale.status === 'EXPIRED') &&
                      !sale.tokenReclaimed &&
                      same(account, sale.seller) && (
                        <button
                          disabled={!actions || pending('RECLAIM_TOKEN')}
                          aria-busy={pending('RECLAIM_TOKEN')}
                          onClick={() => void actions?.reclaim(sale)}
                        >
                          {pending('RECLAIM_TOKEN') ? 'Reclaiming…' : 'Reclaim NFT'}
                        </button>
                      )}
                  </div>
                  {sale.status === 'FUNDED' && expired && (
                    <p className="notice">
                      Deadline passed. The on-chain state remains FUNDED until expiry is executed.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
