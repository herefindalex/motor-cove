import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Marketplace, MyAssets, type MarketActions } from '../features/marketplace/index.js';
import { WalletPanel } from '../capabilities/wallet/index.js';
import { motorCoveApi } from '../integrations/http/motorcove-api.js';
import { useWalletState } from '../integrations/evm/use-wallet-state.js';
import { useEscrowGateway } from '../integrations/evm/use-escrow-gateway.js';
import { TransactionObserver } from '../integrations/evm/TransactionObserver.js';
import {
  SubmissionNotice,
  TransactionTimeline,
  useTransactionJournal,
  useJournalEntries,
  type SubmissionResult,
} from '../capabilities/transactions/index.js';
import { parseEth } from '../features/trading/index.js';
import { useChainTime } from '../integrations/evm/use-chain-time.js';
import { presentProjectionHealth } from '../features/diagnostics/index.js';

export function HomePage() {
  const configQuery = useQuery({
    queryKey: ['config'],
    queryFn: motorCoveApi.config,
    refetchInterval: 2_000,
  });
  const deploymentId = configQuery.data?.deploymentId;
  const chainTime = useChainTime(deploymentId);
  const salesQuery = useQuery({
    queryKey: ['sales', deploymentId],
    queryFn: () => motorCoveApi.sales(deploymentId ?? ''),
    enabled: Boolean(deploymentId),
    refetchInterval: 2000,
  });
  const vehiclesQuery = useQuery({
    queryKey: ['vehicles', deploymentId],
    queryFn: () => motorCoveApi.vehicles(deploymentId ?? ''),
    enabled: Boolean(deploymentId),
    refetchInterval: 2000,
  });
  const systemQuery = useQuery({
    queryKey: ['system', deploymentId],
    queryFn: () => motorCoveApi.system(deploymentId ?? ''),
    enabled: Boolean(deploymentId),
    refetchInterval: 2_000,
  });
  const wallet = useWalletState(Number(configQuery.data?.chainId ?? 31337));
  const journal = useTransactionJournal();
  const journalEntries = useJournalEntries(journal, deploymentId);
  const gateway = useEscrowGateway(configQuery.data, journal);
  const [submissionResult, setSubmissionResult] = useState<SubmissionResult>();
  const [submissionError, setSubmissionError] = useState<string>();
  const account = wallet.state.kind === 'connected' ? wallet.state.account : undefined;
  const submit = async (operation: () => Promise<SubmissionResult>) => {
    setSubmissionError(undefined);
    try {
      setSubmissionResult(await operation());
    } catch (error) {
      setSubmissionResult(undefined);
      setSubmissionError(error instanceof Error ? error.message : String(error));
    }
  };
  const actions: MarketActions | undefined =
    gateway && account
      ? {
          fund: async (sale) =>
            submit(() => gateway.fundSale(BigInt(sale.saleId), BigInt(sale.priceWei))),
          complete: async (sale) => submit(() => gateway.completeSale(BigInt(sale.saleId))),
          cancel: async (sale) => submit(() => gateway.cancelSale(BigInt(sale.saleId))),
          expire: async (sale) => submit(() => gateway.expireSale(BigInt(sale.saleId))),
          withdraw: async (sale) =>
            submit(() => gateway.withdrawPayment(BigInt(sale.saleId), account)),
          reclaim: async (sale) => submit(() => gateway.reclaimToken(BigInt(sale.saleId), account)),
        }
      : undefined;
  if (configQuery.isError || salesQuery.isError || vehiclesQuery.isError || systemQuery.isError)
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
        {deploymentId && <TransactionObserver deploymentId={deploymentId} journal={journal} />}
        {deploymentId && <TransactionTimeline deploymentId={deploymentId} journal={journal} />}
        <section className="danger">
          <h2>Integration error</h2>
          <p>API response failed validation or the service is unavailable.</p>
        </section>
      </>
    );
  const sales = salesQuery.data?.data ?? [];
  const vehicles = vehiclesQuery.data?.data ?? [];
  const indexedBlock = salesQuery.data?.provenance.indexedBlockNumber;
  const latestIncludedBlock = journalEntries.reduce<bigint | null>((latest, entry) => {
    if (entry.status !== 'INCLUDED_SUCCESS' || !entry.receiptBlockNumber) return latest;
    const block = BigInt(entry.receiptBlockNumber);
    return latest === null || block > latest ? block : latest;
  }, null);
  const receiptAheadOfProjection =
    latestIncludedBlock !== null &&
    indexedBlock !== undefined &&
    latestIncludedBlock > BigInt(indexedBlock);
  const receiptLag =
    receiptAheadOfProjection && indexedBlock !== undefined
      ? String(latestIncludedBlock - BigInt(indexedBlock))
      : null;
  const projectionHealth = presentProjectionHealth(
    systemQuery.data?.data,
    indexedBlock,
    receiptLag,
  );
  const activeTokens = new Set(
    sales
      .filter((sale) => !sale.tokenReclaimed && sale.status !== 'COMPLETED')
      .map((sale) => sale.tokenId),
  );
  const assets = vehicles.filter(
    (vehicle): vehicle is typeof vehicle & { tokenId: string } =>
      vehicle.tokenId !== null &&
      Boolean(
        account &&
        vehicle.currentOwner?.toLowerCase() === account.toLowerCase() &&
        !activeTokens.has(vehicle.tokenId),
      ),
  );
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
      {deploymentId && <TransactionObserver deploymentId={deploymentId} journal={journal} />}
      {deploymentId && <TransactionTimeline deploymentId={deploymentId} journal={journal} />}
      <Marketplace
        sales={sales}
        vehicles={vehicles}
        account={account}
        actions={actions}
        currentTimestamp={chainTime}
        provenance={
          <span className={projectionHealth.healthy ? 'provenance' : 'notice'}>
            {projectionHealth.text}
          </span>
        }
      />
      <MyAssets
        assets={assets}
        enabled={Boolean(gateway)}
        onApprove={async (tokenId) => {
          if (gateway) await submit(() => gateway.approveToken(BigInt(tokenId)));
        }}
        onCreate={async (tokenId, priceEth) => {
          if (gateway) await submit(() => gateway.createSale(BigInt(tokenId), parseEth(priceEth)));
        }}
      />
    </>
  );
}
