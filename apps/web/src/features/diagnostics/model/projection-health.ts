import type { SystemStatus } from '@motorcove/api-contracts';

export interface ProjectionHealthPresentation {
  readonly healthy: boolean;
  readonly text: string;
}

export function presentProjectionHealth(
  status: SystemStatus | undefined,
  indexedBlock: string | undefined,
  receiptLag: string | null,
): ProjectionHealthPresentation {
  const block = indexedBlock ?? 'unknown';
  if (!status)
    return { healthy: false, text: `Projection SYNCING · indexed ${block} · lag unknown` };
  if (status.projectionStatus === 'RECOVERY_REQUIRED')
    return {
      healthy: false,
      text: `Projection RECOVERY_REQUIRED · indexed ${block} · reason ${status.recoveryReason ?? 'unknown'}`,
    };
  if (receiptLag !== null)
    return { healthy: false, text: `Projection STALE · indexed ${block} · lag ${receiptLag}` };
  if (status.observationFreshness !== 'FRESH')
    return {
      healthy: false,
      text:
        `Indexer observation ${status.observationFreshness.toLowerCase()} · ` +
        `last known projection ${status.projectionStatus} · indexed ${block} · current lag unknown`,
    };
  if (status.projectionStatus === 'CURRENT')
    return { healthy: true, text: `Indexed block ${block}` };
  return {
    healthy: false,
    text: `Projection ${status.projectionStatus} · indexed ${block} · lag ${status.lagBlocks ?? 'unknown'}`,
  };
}
