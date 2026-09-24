import { useRef, useState } from 'react';
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
import { parseEth, parseReservedBuyer } from '../features/trading/index.js';
import { useChainTime } from '../integrations/evm/use-chain-time.js';
import { useTokenApprovals } from '../integrations/evm/use-token-approvals.js';
import { presentProjectionHealth } from '../features/diagnostics/index.js';
import { resolveAssetApprovalStates } from './asset-approval-state.js';

export function HomePage() {
  const configQuery = useQuery({
    queryKey: ['config'],
    queryFn: motorCoveApi.config,
    refetchInterval: 2_000,
  });
  const deploymentId = configQuery.data?.deploymentId;
  const chainTime = useChainTime(configQuery.data);
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
  const sales = salesQuery.data?.data ?? [];
  const vehicles = vehiclesQuery.data?.data ?? [];
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
  const chainApprovals = useTokenApprovals(
    configQuery.data,
    account,
    assets.map((asset) => asset.tokenId),
    journalEntries
      .filter(
        (entry) =>
          entry.action === 'APPROVE_TOKEN' &&
          entry.deploymentId === deploymentId &&
          entry.account.toLowerCase() === account?.toLowerCase(),
      )
      .map((entry) => `${entry.clientOperationId}:${entry.status}:${entry.updatedAt}`)
      .join('|'),
  );
  const approvalStates = resolveAssetApprovalStates(
    assets.map((asset) => asset.tokenId),
    chainApprovals,
    journalEntries,
    deploymentId,
    account,
  );
  const submissionContextKey = JSON.stringify([
    deploymentId ?? null,
    configQuery.data?.chainId ?? null,
    configQuery.data?.protocolVersion ?? null,
    configQuery.data?.nftAddress?.toLowerCase() ?? null,
    configQuery.data?.escrowAddress?.toLowerCase() ?? null,
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
  const actions: MarketActions | undefined =
    gateway && account
      ? {
          fund: async (sale) =>
            submit(`FUND_SALE:${sale.saleId}`, () =>
              gateway.fundSale(BigInt(sale.saleId), BigInt(sale.priceWei)),
            ),
          complete: async (sale) =>
            submit(`COMPLETE_SALE:${sale.saleId}`, () => gateway.completeSale(BigInt(sale.saleId))),
          cancel: async (sale) =>
            submit(`CANCEL_SALE:${sale.saleId}`, () => gateway.cancelSale(BigInt(sale.saleId))),
          expire: async (sale) =>
            submit(`EXPIRE_SALE:${sale.saleId}`, () => gateway.expireSale(BigInt(sale.saleId))),
          withdraw: async (sale) =>
            submit(`WITHDRAW_PAYMENT:${sale.saleId}`, () =>
              gateway.withdrawPayment(BigInt(sale.saleId), account),
            ),
          reclaim: async (sale) =>
            submit(`RECLAIM_TOKEN:${sale.saleId}`, () =>
              gateway.reclaimToken(BigInt(sale.saleId), account),
            ),
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
        {configQuery.data && <TransactionObserver config={configQuery.data} journal={journal} />}
        {deploymentId && <TransactionTimeline deploymentId={deploymentId} journal={journal} />}
        <section className="danger">
          <h2>Integration error</h2>
          <p>API response failed validation or the service is unavailable.</p>
        </section>
      </>
    );
  const indexedBlock = salesQuery.data?.provenance.indexedBlockNumber;
  const latestIncludedBlock = journalEntries.reduce<bigint | null>((latest, entry) => {
    if (entry.status !== 'INCLUDED_SUCCESS' || !entry.receiptBlockNumber) return latest;
    if (entry.chainId !== 31337 && entry.finalityStatus !== 'FINALIZED') return latest;
    const block = BigInt(entry.receiptBlockNumber);
    return latest === null || block > latest ? block : latest;
  }, null);
  const receiptAheadOfProjection =
    latestIncludedBlock !== null &&
    indexedBlock !== undefined &&
    latestIncludedBlock > BigInt(indexedBlock);
  const receiptWaitingForFinality = journalEntries.some(
    (entry) =>
      entry.status === 'INCLUDED_SUCCESS' &&
      entry.chainId !== 31337 &&
      entry.finalityStatus !== 'FINALIZED',
  );
  const receiptLag =
    receiptAheadOfProjection && indexedBlock !== undefined
      ? String(latestIncludedBlock - BigInt(indexedBlock))
      : null;
  const projectionHealth = presentProjectionHealth(
    systemQuery.data?.data,
    indexedBlock,
    receiptLag,
    configQuery.data ? { chainId: configQuery.data.chainId, now: new Date() } : undefined,
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
      {configQuery.data && <TransactionObserver config={configQuery.data} journal={journal} />}
      {deploymentId && <TransactionTimeline deploymentId={deploymentId} journal={journal} />}
      {receiptWaitingForFinality && (
        <p className="notice" role="status">
          Transaction included; waiting for chain finality.
        </p>
      )}
      {receiptAheadOfProjection && (
        <p className="notice" role="status">
          {systemQuery.data?.data.projectionStatus === 'RECOVERY_REQUIRED'
            ? 'Transaction included on-chain. Marketplace projection requires recovery.'
            : systemQuery.data?.data.observationFreshness !== 'FRESH'
              ? 'Transaction included on-chain. Marketplace projection verification is unavailable.'
              : 'Transaction confirmed on-chain. Marketplace data is still syncing.'}
        </p>
      )}
      <Marketplace
        sales={sales}
        loading={!salesQuery.data}
        vehicles={vehicles}
        account={account}
        actions={actions}
        pendingActionKeys={pendingActions}
        currentTimestamp={chainTime}
        provenance={
          <span className={projectionHealth.healthy ? 'provenance' : 'notice'}>
            {projectionHealth.text}
          </span>
        }
      />
      <MyAssets
        assets={assets}
        loading={!vehiclesQuery.data || !salesQuery.data}
        enabled={Boolean(gateway)}
        approvalStates={approvalStates}
        pendingActionKeys={pendingActions}
        onApprove={async (tokenId) => {
          if (gateway)
            await submit(`APPROVE_TOKEN:${tokenId}`, () => gateway.approveToken(BigInt(tokenId)));
        }}
        onCreate={async (tokenId, priceEth, allowedBuyer) => {
          if (gateway && account)
            await submit(`CREATE_SALE:${tokenId}`, () =>
              gateway.createSale(
                BigInt(tokenId),
                parseEth(priceEth),
                parseReservedBuyer(allowedBuyer, account),
              ),
            );
        }}
      />
    </>
  );
}
