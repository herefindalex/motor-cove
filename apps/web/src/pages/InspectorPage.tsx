import { useQuery } from '@tanstack/react-query';
import { SystemInspector } from '../features/diagnostics/index.js';
import { motorCoveApi } from '../integrations/http/motorcove-api.js';
export function InspectorPage() {
  const config = useQuery({
    queryKey: ['config'],
    queryFn: motorCoveApi.config,
    refetchInterval: 2_000,
  });
  const deploymentId = config.data?.deploymentId;
  const status = useQuery({
    queryKey: ['system', deploymentId],
    queryFn: () => motorCoveApi.system(deploymentId ?? ''),
    enabled: Boolean(deploymentId),
    refetchInterval: 2000,
  });
  if (!config.data || !status.data)
    return (
      <section>
        <h2>System Inspector</h2>
        <p>Loading diagnostics…</p>
      </section>
    );
  return (
    <SystemInspector
      items={{
        deploymentId: config.data.deploymentId,
        chainId: config.data.chainId,
        nftAddress: config.data.nftAddress,
        escrowAddress: config.data.escrowAddress,
        indexedBlock: status.data.provenance.indexedBlockNumber,
        indexedBlockHash: status.data.provenance.indexedBlockHash,
        projectorVersion: status.data.provenance.projectorVersion,
        projectionBuildId: status.data.provenance.projectionBuildId,
        logScopeHash: status.data.provenance.logScopeHash,
        ...status.data.data,
      }}
    />
  );
}
