import { useMemo, useRef } from 'react';
import { decodeFunctionResult, encodeFunctionData } from 'viem';
import { usePublicClient, useWalletClient } from 'wagmi';
import { motorCoveEscrowAbi, vehicleNftAbi } from '@motorcove/chain-artifacts';
import type { PublicConfig } from '@motorcove/api-contracts';
import {
  submitOperation,
  type SubmissionResult,
  type TransactionJournal,
} from '../../capabilities/transactions/index.js';
import type { EscrowGateway } from '../../features/trading/index.js';
import { BrowserTransactionSubmissionCoordinator } from '../persistence/browser-submission-coordinator.js';

type Action = {
  name: string;
  saleId?: bigint;
  tokenId?: bigint;
  value: bigint;
  contract: `0x${string}`;
  calldata: `0x${string}`;
  simulate(): Promise<unknown>;
  submit(): Promise<`0x${string}`>;
};

type WalletEthCall = (request: {
  readonly method: 'eth_call';
  readonly params: readonly [
    { readonly to: `0x${string}`; readonly data: `0x${string}` },
    'latest',
  ];
}) => Promise<`0x${string}`>;

export function useEscrowGateway(
  config: PublicConfig | undefined,
  journal: TransactionJournal,
): EscrowGateway | null {
  const wallet = useWalletClient();
  const publicClient = usePublicClient();
  const submissionCoordinator = useMemo(() => new BrowserTransactionSubmissionCoordinator(), []);
  const liveContext = useRef({
    account: wallet.data?.account.address,
    chainId: wallet.data?.chain.id,
    deploymentId: config?.deploymentId,
    protocolVersion: config?.protocolVersion,
    nftAddress: config?.nftAddress,
    escrowAddress: config?.escrowAddress,
  });
  liveContext.current = {
    account: wallet.data?.account.address,
    chainId: wallet.data?.chain.id,
    deploymentId: config?.deploymentId,
    protocolVersion: config?.protocolVersion,
    nftAddress: config?.nftAddress,
    escrowAddress: config?.escrowAddress,
  };

  return useMemo(() => {
    if (!config || !wallet.data?.account || !publicClient) return null;

    const account = wallet.data.account.address;
    const chainId = Number(config.chainId);
    const nft = config.nftAddress as `0x${string}`;
    const escrow = config.escrowAddress as `0x${string}`;
    const deploymentId = config.deploymentId as `0x${string}`;
    const deploymentIdCall = encodeFunctionData({
      abi: motorCoveEscrowAbi,
      functionName: 'deploymentId',
    });
    const verifyBeforeSubmit = async (): Promise<void> => {
      const publicChainId = await publicClient.getChainId();
      if (publicChainId !== chainId || wallet.data.chain.id !== chainId) {
        throw new Error('OPERATION_ENVIRONMENT_MISMATCH');
      }
      const publicDeploymentId = await publicClient.readContract({
        address: escrow,
        abi: motorCoveEscrowAbi,
        functionName: 'deploymentId',
      });
      const walletDeploymentResult = await (wallet.data.request as unknown as WalletEthCall)({
        method: 'eth_call',
        params: [{ to: escrow, data: deploymentIdCall }, 'latest'],
      });
      const walletDeploymentId = decodeFunctionResult({
        abi: motorCoveEscrowAbi,
        functionName: 'deploymentId',
        data: walletDeploymentResult,
      });
      if (
        publicDeploymentId.toLowerCase() !== deploymentId.toLowerCase() ||
        walletDeploymentId.toLowerCase() !== deploymentId.toLowerCase()
      ) {
        throw new Error('OPERATION_ENVIRONMENT_MISMATCH');
      }
    };
    const run = (action: Action): Promise<SubmissionResult> =>
      submitOperation(
        {
          deploymentId,
          chainId,
          account,
          protocolVersion: config.protocolVersion,
          contextStillCurrent: () =>
            liveContext.current.account?.toLowerCase() === account.toLowerCase() &&
            liveContext.current.chainId === chainId &&
            liveContext.current.deploymentId?.toLowerCase() === config.deploymentId.toLowerCase() &&
            liveContext.current.protocolVersion === config.protocolVersion &&
            liveContext.current.nftAddress?.toLowerCase() === nft.toLowerCase() &&
            liveContext.current.escrowAddress?.toLowerCase() === escrow.toLowerCase(),
        },
        {
          ...action,
          verifyBeforeSubmit,
          readNonce: async (hash) => (await publicClient.getTransaction({ hash })).nonce,
        },
        journal,
        submissionCoordinator,
      );

    return {
      approveToken: (tokenId) =>
        run({
          name: 'APPROVE_TOKEN',
          tokenId,
          value: 0n,
          contract: nft,
          calldata: encodeFunctionData({
            abi: vehicleNftAbi,
            functionName: 'approve',
            args: [escrow, tokenId],
          }),
          simulate: () =>
            publicClient.simulateContract({
              account,
              address: nft,
              abi: vehicleNftAbi,
              functionName: 'approve',
              args: [escrow, tokenId],
            }),
          submit: () =>
            wallet.data.writeContract({
              address: nft,
              abi: vehicleNftAbi,
              functionName: 'approve',
              args: [escrow, tokenId],
            }),
        }),
      createSale: (tokenId, priceWei, allowedBuyer) =>
        run({
          name: 'CREATE_SALE',
          tokenId,
          value: 0n,
          contract: escrow,
          calldata: encodeFunctionData({
            abi: motorCoveEscrowAbi,
            functionName: 'createSale',
            args: [tokenId, priceWei, allowedBuyer],
          }),
          simulate: () =>
            publicClient.simulateContract({
              account,
              address: escrow,
              abi: motorCoveEscrowAbi,
              functionName: 'createSale',
              args: [tokenId, priceWei, allowedBuyer],
            }),
          submit: () =>
            wallet.data.writeContract({
              address: escrow,
              abi: motorCoveEscrowAbi,
              functionName: 'createSale',
              args: [tokenId, priceWei, allowedBuyer],
            }),
        }),
      fundSale: (saleId, priceWei) =>
        run({
          name: 'FUND_SALE',
          saleId,
          value: priceWei,
          contract: escrow,
          calldata: encodeFunctionData({
            abi: motorCoveEscrowAbi,
            functionName: 'fundSale',
            args: [saleId],
          }),
          simulate: () =>
            publicClient.simulateContract({
              account,
              address: escrow,
              abi: motorCoveEscrowAbi,
              functionName: 'fundSale',
              args: [saleId],
              value: priceWei,
            }),
          submit: () =>
            wallet.data.writeContract({
              address: escrow,
              abi: motorCoveEscrowAbi,
              functionName: 'fundSale',
              args: [saleId],
              value: priceWei,
            }),
        }),
      completeSale: (saleId) =>
        run({
          name: 'COMPLETE_SALE',
          saleId,
          value: 0n,
          contract: escrow,
          calldata: encodeFunctionData({
            abi: motorCoveEscrowAbi,
            functionName: 'completeSale',
            args: [saleId],
          }),
          simulate: () =>
            publicClient.simulateContract({
              account,
              address: escrow,
              abi: motorCoveEscrowAbi,
              functionName: 'completeSale',
              args: [saleId],
            }),
          submit: () =>
            wallet.data.writeContract({
              address: escrow,
              abi: motorCoveEscrowAbi,
              functionName: 'completeSale',
              args: [saleId],
            }),
        }),
      cancelSale: (saleId) =>
        run({
          name: 'CANCEL_SALE',
          saleId,
          value: 0n,
          contract: escrow,
          calldata: encodeFunctionData({
            abi: motorCoveEscrowAbi,
            functionName: 'cancelSale',
            args: [saleId],
          }),
          simulate: () =>
            publicClient.simulateContract({
              account,
              address: escrow,
              abi: motorCoveEscrowAbi,
              functionName: 'cancelSale',
              args: [saleId],
            }),
          submit: () =>
            wallet.data.writeContract({
              address: escrow,
              abi: motorCoveEscrowAbi,
              functionName: 'cancelSale',
              args: [saleId],
            }),
        }),
      expireSale: (saleId) =>
        run({
          name: 'EXPIRE_SALE',
          saleId,
          value: 0n,
          contract: escrow,
          calldata: encodeFunctionData({
            abi: motorCoveEscrowAbi,
            functionName: 'expireSale',
            args: [saleId],
          }),
          simulate: () =>
            publicClient.simulateContract({
              account,
              address: escrow,
              abi: motorCoveEscrowAbi,
              functionName: 'expireSale',
              args: [saleId],
            }),
          submit: () =>
            wallet.data.writeContract({
              address: escrow,
              abi: motorCoveEscrowAbi,
              functionName: 'expireSale',
              args: [saleId],
            }),
        }),
      withdrawPayment: (saleId, recipient) =>
        run({
          name: 'WITHDRAW_PAYMENT',
          saleId,
          value: 0n,
          contract: escrow,
          calldata: encodeFunctionData({
            abi: motorCoveEscrowAbi,
            functionName: 'withdrawPayment',
            args: [saleId, recipient],
          }),
          simulate: () =>
            publicClient.simulateContract({
              account,
              address: escrow,
              abi: motorCoveEscrowAbi,
              functionName: 'withdrawPayment',
              args: [saleId, recipient],
            }),
          submit: () =>
            wallet.data.writeContract({
              address: escrow,
              abi: motorCoveEscrowAbi,
              functionName: 'withdrawPayment',
              args: [saleId, recipient],
            }),
        }),
      reclaimToken: (saleId, recipient) =>
        run({
          name: 'RECLAIM_TOKEN',
          saleId,
          value: 0n,
          contract: escrow,
          calldata: encodeFunctionData({
            abi: motorCoveEscrowAbi,
            functionName: 'reclaimToken',
            args: [saleId, recipient],
          }),
          simulate: () =>
            publicClient.simulateContract({
              account,
              address: escrow,
              abi: motorCoveEscrowAbi,
              functionName: 'reclaimToken',
              args: [saleId, recipient],
            }),
          submit: () =>
            wallet.data.writeContract({
              address: escrow,
              abi: motorCoveEscrowAbi,
              functionName: 'reclaimToken',
              args: [saleId, recipient],
            }),
        }),
    };
  }, [config, journal, publicClient, submissionCoordinator, wallet.data]);
}
