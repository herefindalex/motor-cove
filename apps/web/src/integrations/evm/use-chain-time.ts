import { useQuery } from '@tanstack/react-query';
import type { PublicConfig } from '@motorcove/api-contracts';
import { usePublicClient } from 'wagmi';
import {
  assertPublicBlockUnchanged,
  readPublicDeploymentBlock,
} from './public-deployment-block.js';

export function useChainTime(config: PublicConfig | undefined): number | undefined {
  const client = usePublicClient();
  const query = useQuery({
    queryKey: ['chain-time', config?.deploymentId, config?.chainId, config?.escrowAddress],
    enabled: Boolean(client && config),
    refetchInterval: 1000,
    queryFn: async () => {
      if (!client || !config) throw new Error('RPC_UNAVAILABLE');
      const block = await readPublicDeploymentBlock(client, config);
      await assertPublicBlockUnchanged(client, config, block);
      return Number(block.timestamp);
    },
  });
  return query.isError ? undefined : query.data;
}
