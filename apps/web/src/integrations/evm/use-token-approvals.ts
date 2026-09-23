import { useQuery } from '@tanstack/react-query';
import { vehicleNftAbi } from '@motorcove/chain-artifacts';
import type { PublicConfig } from '@motorcove/api-contracts';
import { usePublicClient } from 'wagmi';

export type ChainApprovalState =
  | 'checking'
  | 'approved'
  | 'not-approved'
  | 'owner-mismatch'
  | 'unavailable';

export function useTokenApprovals(
  config: PublicConfig | undefined,
  account: `0x${string}` | undefined,
  tokenIds: readonly string[],
  approvalEvidenceRevision = '',
): ReadonlyMap<string, ChainApprovalState> {
  const client = usePublicClient();
  const tokenKey = tokenIds.join(',');
  const query = useQuery({
    queryKey: [
      'token-approvals',
      config?.deploymentId,
      config?.chainId,
      config?.nftAddress,
      config?.escrowAddress,
      account,
      tokenKey,
      approvalEvidenceRevision,
    ],
    enabled: Boolean(client && config && account && tokenIds.length),
    refetchInterval: 2_000,
    queryFn: async () => {
      if (!client || !config || !account) throw new Error('APPROVAL_CONTEXT_UNAVAILABLE');
      if ((await client.getChainId()) !== Number(config.chainId))
        throw new Error('APPROVAL_CHAIN_MISMATCH');

      const nft = config.nftAddress as `0x${string}`;
      const escrow = config.escrowAddress.toLowerCase();
      return new Map(
        await Promise.all(
          tokenIds.map(async (tokenId) => {
            const [owner, approvedAddress, operatorApproved] = await Promise.all([
              client.readContract({
                address: nft,
                abi: vehicleNftAbi,
                functionName: 'ownerOf',
                args: [BigInt(tokenId)],
              }),
              client.readContract({
                address: nft,
                abi: vehicleNftAbi,
                functionName: 'getApproved',
                args: [BigInt(tokenId)],
              }),
              client.readContract({
                address: nft,
                abi: vehicleNftAbi,
                functionName: 'isApprovedForAll',
                args: [account, config.escrowAddress as `0x${string}`],
              }),
            ]);
            const state: ChainApprovalState =
              owner.toLowerCase() !== account.toLowerCase()
                ? 'owner-mismatch'
                : approvedAddress.toLowerCase() === escrow || operatorApproved
                  ? 'approved'
                  : 'not-approved';
            return [tokenId, state] as const;
          }),
        ),
      );
    },
  });

  const result = new Map<string, ChainApprovalState>();
  for (const tokenId of tokenIds) {
    result.set(tokenId, query.isError ? 'unavailable' : (query.data?.get(tokenId) ?? 'checking'));
  }
  return result;
}
