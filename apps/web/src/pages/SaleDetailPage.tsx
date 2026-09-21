import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { WalletPanel } from '../capabilities/wallet/index.js';
import { TransactionTimeline, type SubmissionResult } from '../capabilities/transactions/index.js';
import { Marketplace, type MarketActions } from '../features/marketplace/index.js';
import { motorCoveApi } from '../integrations/http/motorcove-api.js';
import { LocalStorageJournal } from '../integrations/persistence/local-storage-journal.js';
import { TransactionObserver } from '../integrations/evm/TransactionObserver.js';
import { useChainTime } from '../integrations/evm/use-chain-time.js';
import { useEscrowGateway } from '../integrations/evm/use-escrow-gateway.js';
import { useWalletState } from '../integrations/evm/use-wallet-state.js';

export function SaleDetailPage() {
  const { saleId } = useParams();
  const config = useQuery({ queryKey: ['config'], queryFn: motorCoveApi.config });
  const sale = useQuery({
    queryKey: ['sale', config.data?.deploymentId, saleId],
    queryFn: () => motorCoveApi.sale(saleId ?? ''),
    enabled: Boolean(config.data && saleId),
    refetchInterval: 2_000,
  });
  const vehicles = useQuery({
    queryKey: ['vehicles', config.data?.deploymentId],
    queryFn: motorCoveApi.vehicles,
    enabled: Boolean(config.data),
    refetchInterval: 2_000,
  });
  const wallet = useWalletState(Number(config.data?.chainId ?? 31337));
  const journal = useMemo(() => new LocalStorageJournal(), []);
  const gateway = useEscrowGateway(config.data, journal);
  const currentTimestamp = useChainTime(config.data?.deploymentId);
  const [message, setMessage] = useState<string>();

  const submit = async (operation: () => Promise<SubmissionResult>) => {
    const result = await operation();
    setMessage(
      result.kind === 'submitted'
        ? `Submitted ${result.hash ?? ''}`
        : result.kind === 'rejected'
          ? 'Wallet request rejected.'
          : result.kind === 'failed'
            ? result.message
            : 'Submission outcome unknown. Check the transaction timeline before retrying.',
    );
  };

  const actions: MarketActions | undefined = gateway
    ? {
        fund: async (item) =>
          submit(() => gateway.fundSale(BigInt(item.saleId), BigInt(item.priceWei))),
        complete: async (item) => submit(() => gateway.completeSale(BigInt(item.saleId))),
        cancel: async (item) => submit(() => gateway.cancelSale(BigInt(item.saleId))),
        expire: async (item) => submit(() => gateway.expireSale(BigInt(item.saleId))),
        withdraw: async (item) =>
          submit(() =>
            gateway.withdrawPayment(
              BigInt(item.saleId),
              (wallet.state.kind === 'connected'
                ? wallet.state.account
                : item.seller) as `0x${string}`,
            ),
          ),
        reclaim: async (item) =>
          submit(() =>
            gateway.reclaimToken(
              BigInt(item.saleId),
              (wallet.state.kind === 'connected'
                ? wallet.state.account
                : item.seller) as `0x${string}`,
            ),
          ),
      }
    : undefined;

  if (!saleId || config.isError || sale.isError || vehicles.isError)
    return (
      <section>
        <h2>Sale detail unavailable</h2>
        <p>The sale or its read model could not be loaded.</p>
      </section>
    );
  if (!config.data || !sale.data || !vehicles.data) return <p>Loading sale detail…</p>;

  return (
    <>
      <section className="wallet-row">
        <WalletPanel
          state={wallet.state}
          pending={wallet.pending}
          onConnect={wallet.connect}
          onDisconnect={wallet.disconnect}
          onSwitch={wallet.switchNetwork}
        />
        {message && <output>{message}</output>}
      </section>
      <Marketplace
        sales={[sale.data.data]}
        vehicles={vehicles.data.data}
        account={wallet.state.kind === 'connected' ? wallet.state.account : undefined}
        actions={actions}
        currentTimestamp={currentTimestamp}
        provenance={
          <span className="provenance">
            Indexed block {sale.data.provenance.indexedBlockNumber} · projection{' '}
            {sale.data.provenance.projectorVersion}
          </span>
        }
      />
      <TransactionObserver deploymentId={config.data.deploymentId} journal={journal} />
      <TransactionTimeline
        deploymentId={config.data.deploymentId}
        journal={journal}
        saleId={saleId}
      />
    </>
  );
}
