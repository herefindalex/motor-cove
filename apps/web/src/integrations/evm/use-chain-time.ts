import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
export function useChainTime(deploymentId: string | undefined): number | undefined {
  const client = usePublicClient();
  return useQuery({
    queryKey: ['chain-time', deploymentId],
    enabled: Boolean(client && deploymentId),
    refetchInterval: 1000,
    queryFn: async () => {
      if (!client) throw new Error('RPC_UNAVAILABLE');
      return Number((await client.getBlock()).timestamp);
    },
  }).data;
}
