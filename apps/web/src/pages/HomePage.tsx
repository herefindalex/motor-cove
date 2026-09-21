import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Marketplace, MyAssets, type MarketActions } from '../features/marketplace/index.js';
import { WalletPanel } from '../capabilities/wallet/index.js';
import { motorCoveApi } from '../integrations/http/motorcove-api.js';
import { useWalletState } from '../integrations/evm/use-wallet-state.js';
import { useEscrowGateway } from '../integrations/evm/use-escrow-gateway.js';
import { LocalStorageJournal } from '../integrations/persistence/local-storage-journal.js';
import { TransactionObserver } from '../integrations/evm/TransactionObserver.js';
import {
  TransactionTimeline,
  useJournalEntries,
  type SubmissionResult,
} from '../capabilities/transactions/index.js';
import { parseEth } from '../features/trading/index.js';
import { useChainTime } from '../integrations/evm/use-chain-time.js';

export function HomePage() {
  const configQuery = useQuery({ queryKey: ['config'], queryFn: motorCoveApi.config });
  const deploymentId = configQuery.data?.deploymentId;
  const chainTime = useChainTime(deploymentId);
  const salesQuery = useQuery({
    queryKey: ['sales', deploymentId],
    queryFn: motorCoveApi.sales,
    enabled: Boolean(deploymentId),
    refetchInterval: 2000,
  });
  const vehiclesQuery = useQuery({
    queryKey: ['vehicles', deploymentId],
    queryFn: motorCoveApi.vehicles,
    enabled: Boolean(deploymentId),
    refetchInterval: 2000,
  });
  const systemQuery = useQuery({
    queryKey: ['system', deploymentId],
    queryFn: motorCoveApi.system,
    enabled: Boolean(deploymentId),
    refetchInterval: 2_000,
  });
  const wallet = useWalletState(Number(configQuery.data?.chainId ?? 31337));
  const journal = useMemo(() => new LocalStorageJournal(), []);
  const journalEntries = useJournalEntries(journal, deploymentId);
  const gateway = useEscrowGateway(configQuery.data, journal);
  const [message, setMessage] = useState<string>();
  const account = wallet.state.kind === 'connected' ? wallet.state.account : undefined;
  const submit = async (operation: () => Promise<SubmissionResult>) => {
    const result = await operation();
    setMessage(
      result.kind === 'submitted'
        ? `Submitted ${result.hash ?? ''}`
        : result.kind === 'rejected'
          ? 'Wallet request rejected.'
          : result.kind === 'failed'
            ? result.message
            : 'Submission state is unknown. Check your wallet and the journal.',
    );
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
      <section className="danger">
        <h2>Integration error</h2>
        <p>API response failed validation or the service is unavailable.</p>
      </section>
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
  const projectionStatus = receiptAheadOfProjection
    ? 'STALE'
    : (systemQuery.data?.data.projectionStatus ?? 'SYNCING');
  const receiptLag =
    receiptAheadOfProjection && indexedBlock !== undefined
      ? String(latestIncludedBlock - BigInt(indexedBlock))
      : null;
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
        {message && <output>{message}</output>}
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
          projectionStatus === 'CURRENT' ? (
            <span className="provenance">
              Indexed block {salesQuery.data?.provenance.indexedBlockNumber ?? '…'}
            </span>
          ) : (
            <span className="notice">
              Projection {projectionStatus} · indexed{' '}
              {salesQuery.data?.provenance.indexedBlockNumber ?? '…'} · lag{' '}
              {receiptLag ?? systemQuery.data?.data.lagBlocks ?? 'unknown'}
            </span>
          )
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
