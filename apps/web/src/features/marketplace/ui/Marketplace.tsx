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
  provenance,
  currentTimestamp,
}: {
  sales: readonly SaleResponse[];
  vehicles: readonly Vehicle[];
  account: string | undefined;
  actions: MarketActions | undefined;
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
      {sales.length === 0 ? (
        <p className="empty">No projected listings.</p>
      ) : (
        <div className="cards">
          {sales.map((sale) => {
            const vehicle = byToken.get(sale.tokenId);
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
                      <button disabled={!actions} onClick={() => void actions?.fund(sale)}>
                        Fund exactly
                      </button>
                    )}
                    {sale.status === 'LISTED' && same(account, sale.seller) && (
                      <button disabled={!actions} onClick={() => void actions?.cancel(sale)}>
                        Cancel listing
                      </button>
                    )}
                    {sale.status === 'FUNDED' && same(account, sale.buyer) && !expired && (
                      <button disabled={!actions} onClick={() => void actions?.complete(sale)}>
                        Complete sale
                      </button>
                    )}
                    {sale.status === 'FUNDED' && expired && (
                      <button disabled={!actions} onClick={() => void actions?.expire(sale)}>
                        Execute expiry
                      </button>
                    )}
                    {sale.claim?.status === 'CLAIMABLE' &&
                      same(account, sale.claim.beneficiary) && (
                        <button disabled={!actions} onClick={() => void actions?.withdraw(sale)}>
                          {sale.claim.kind === 'BUYER_REFUND'
                            ? 'Withdraw refund'
                            : 'Withdraw proceeds'}
                        </button>
                      )}
                    {(sale.status === 'CANCELLED' || sale.status === 'EXPIRED') &&
                      !sale.tokenReclaimed &&
                      same(account, sale.seller) && (
                        <button disabled={!actions} onClick={() => void actions?.reclaim(sale)}>
                          Reclaim NFT
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
