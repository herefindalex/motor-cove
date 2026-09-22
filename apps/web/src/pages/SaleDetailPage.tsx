import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { WalletPanel } from '../capabilities/wallet/index.js';
import {
  SubmissionNotice,
  TransactionTimeline,
  useTransactionJournal,
  type SubmissionResult,
} from '../capabilities/transactions/index.js';
import { Marketplace, type MarketActions } from '../features/marketplace/index.js';
import { motorCoveApi } from '../integrations/http/motorcove-api.js';
import { TransactionObserver } from '../integrations/evm/TransactionObserver.js';
import { useChainTime } from '../integrations/evm/use-chain-time.js';
import { useEscrowGateway } from '../integrations/evm/use-escrow-gateway.js';
import { useWalletState } from '../integrations/evm/use-wallet-state.js';

export function SaleDetailPage() {
  const { saleId } = useParams();
  const config = useQuery({
    queryKey: ['config'],
    queryFn: motorCoveApi.config,
    refetchInterval: 2_000,
  });
  const deploymentId = config.data?.deploymentId;
  const sale = useQuery({
    queryKey: ['sale', deploymentId, saleId],
    queryFn: () => motorCoveApi.sale(saleId ?? '', deploymentId ?? ''),
    enabled: Boolean(deploymentId && saleId),
    refetchInterval: 2_000,
  });
  const vehicles = useQuery({
    queryKey: ['vehicles', deploymentId],
    queryFn: () => motorCoveApi.vehicles(deploymentId ?? ''),
    enabled: Boolean(deploymentId),
    refetchInterval: 2_000,
  });
  const wallet = useWalletState(Number(config.data?.chainId ?? 31337));
  const journal = useTransactionJournal();
  const gateway = useEscrowGateway(config.data, journal);
  const currentTimestamp = useChainTime(config.data?.deploymentId);
  const [submissionResult, setSubmissionResult] = useState<SubmissionResult>();
  const [submissionError, setSubmissionError] = useState<string>();

  const submit = async (operation: () => Promise<SubmissionResult>) => {
    setSubmissionError(undefined);
    try {
      setSubmissionResult(await operation());
    } catch (error) {
      setSubmissionResult(undefined);
      setSubmissionError(error instanceof Error ? error.message : String(error));
    }
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
      <>
        <section className="wallet-row">
          <WalletPanel
            state={wallet.state}
            connectors={wallet.connectors}
            error={wallet.error}
            pending={wallet.pending}
            onConnect={wallet.connect}
            onDisconnect={wallet.disconnect}
            onSwitch={wallet.switchNetwork}
          />
          <SubmissionNotice result={submissionResult} error={submissionError} />
        </section>
        {config.data?.deploymentId && (
          <TransactionObserver deploymentId={config.data.deploymentId} journal={journal} />
        )}
        {config.data?.deploymentId && (
          <TransactionTimeline
            deploymentId={config.data.deploymentId}
            journal={journal}
            saleId={saleId}
          />
        )}
        <section className="danger">
          <h2>Sale detail unavailable</h2>
          <p>The sale or its read model could not be loaded.</p>
        </section>
      </>
    );
  if (!config.data || !sale.data || !vehicles.data) return <p>Loading sale detail…</p>;

  return (
    <>
      <section className="wallet-row">
        <WalletPanel
          state={wallet.state}
          connectors={wallet.connectors}
          error={wallet.error}
          pending={wallet.pending}
          onConnect={wallet.connect}
          onDisconnect={wallet.disconnect}
          onSwitch={wallet.switchNetwork}
        />
        <SubmissionNotice result={submissionResult} error={submissionError} />
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
