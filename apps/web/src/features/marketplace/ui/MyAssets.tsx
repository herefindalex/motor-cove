import { useState } from 'react';
interface Asset {
  tokenId: string;
  name: string;
  currentOwner: string | null;
}
export function MyAssets({
  assets,
  enabled,
  onApprove,
  onCreate,
}: {
  assets: readonly Asset[];
  enabled: boolean;
  onApprove(tokenId: string): Promise<void>;
  onCreate(tokenId: string, priceEth: string): Promise<void>;
}) {
  const [price, setPrice] = useState('1');
  return (
    <section>
      <h2>My assets</h2>
      <p>
        Approval and listing are separate transactions. Wait for approval inclusion before creating
        the sale.
      </p>
      <label>
        Listing price (test ETH)
        <input
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          inputMode="decimal"
        />
      </label>
      <div className="assets">
        {assets.length === 0 ? (
          <p className="empty">Connect the seeded seller account to list an unescrowed asset.</p>
        ) : (
          assets.map((asset) => (
            <article className="asset" key={asset.tokenId}>
              <strong>{asset.name}</strong>
              <span>Token #{asset.tokenId}</span>
              <button disabled={!enabled} onClick={() => void onApprove(asset.tokenId)}>
                1. Approve
              </button>
              <button disabled={!enabled} onClick={() => void onCreate(asset.tokenId, price)}>
                2. Create sale
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
