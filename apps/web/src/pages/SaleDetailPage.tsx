import { useRef, useState } from 'react';
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
  const account = wallet.state.kind === 'connected' ? wallet.state.account : undefined;
  const submissionContextKey = JSON.stringify([
    deploymentId ?? null,
    config.data?.chainId ?? null,
    config.data?.protocolVersion ?? null,
    config.data?.nftAddress?.toLowerCase() ?? null,
    config.data?.escrowAddress?.toLowerCase() ?? null,
    account?.toLowerCase() ?? null,
  ]);
  const pendingActionPrefix = `${submissionContextKey}\0`;
  const pendingIntentKeys = useRef(new Set<string>());
  const [pendingIntents, setPendingIntents] = useState<ReadonlySet<string>>(new Set());
  const pendingActions = new Set(
    [...pendingIntents]
      .filter((key) => key.startsWith(pendingActionPrefix))
      .map((key) => key.slice(pendingActionPrefix.length)),
  );

  const submit = async (actionKey: string, operation: () => Promise<SubmissionResult>) => {
    const intentKey = `${pendingActionPrefix}${actionKey}`;
    if (pendingIntentKeys.current.has(intentKey)) return;
    pendingIntentKeys.current.add(intentKey);
    setPendingIntents(new Set(pendingIntentKeys.current));
    setSubmissionError(undefined);
    try {
      setSubmissionResult(await operation());
    } catch (error) {
      setSubmissionResult(undefined);
      setSubmissionError(error instanceof Error ? error.message : String(error));
    } finally {
      pendingIntentKeys.current.delete(intentKey);
      setPendingIntents(new Set(pendingIntentKeys.current));
    }
  };

  const actions: MarketActions | undefined = gateway
    ? {
        fund: async (item) =>
          submit(`FUND_SALE:${item.saleId}`, () =>
            gateway.fundSale(BigInt(item.saleId), BigInt(item.priceWei)),
          ),
        complete: async (item) =>
          submit(`COMPLETE_SALE:${item.saleId}`, () => gateway.completeSale(BigInt(item.saleId))),
        cancel: async (item) =>
          submit(`CANCEL_SALE:${item.saleId}`, () => gateway.cancelSale(BigInt(item.saleId))),
        expire: async (item) =>
          submit(`EXPIRE_SALE:${item.saleId}`, () => gateway.expireSale(BigInt(item.saleId))),
        withdraw: async (item) =>
          submit(`WITHDRAW_PAYMENT:${item.saleId}`, () =>
            gateway.withdrawPayment(
              BigInt(item.saleId),
              (wallet.state.kind === 'connected'
                ? wallet.state.account
                : item.seller) as `0x${string}`,
            ),
          ),
        reclaim: async (item) =>
          submit(`RECLAIM_TOKEN:${item.saleId}`, () =>
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
        {config.data && <TransactionObserver config={config.data} journal={journal} />}
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
        pendingActionKeys={pendingActions}
        currentTimestamp={currentTimestamp}
        provenance={
          <span className="provenance">
            Indexed block {sale.data.provenance.indexedBlockNumber} · projection{' '}
            {sale.data.provenance.projectorVersion}
          </span>
        }
      />
      <TransactionObserver config={config.data} journal={journal} />
      <TransactionTimeline
        deploymentId={config.data.deploymentId}
        journal={journal}
        saleId={saleId}
      />
    </>
  );
}
