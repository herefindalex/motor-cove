export type FinalityPolicy = Readonly<{ kind: 'IMMEDIATE' }> | Readonly<{ kind: 'RPC_FINALIZED' }>;

export interface ChainProfile {
  readonly key: 'anvil' | 'ethereum' | 'polygon';
  readonly chainId: number;
  readonly finality: FinalityPolicy;
  readonly expectedBlockIntervalMs?: number;
  readonly headStallThresholdMs?: number;
  readonly providerRequirements: Readonly<{
    blockHashLogs: true;
    finalizedTag: boolean;
    historicalStateForReconciliation: boolean;
  }>;
}

const profiles = Object.freeze({
  '31337': Object.freeze({
    key: 'anvil',
    chainId: 31337,
    finality: Object.freeze({ kind: 'IMMEDIATE' }),
    providerRequirements: Object.freeze({
      blockHashLogs: true,
      finalizedTag: false,
      historicalStateForReconciliation: true,
    }),
  }),
  '1': Object.freeze({
    key: 'ethereum',
    chainId: 1,
    finality: Object.freeze({ kind: 'RPC_FINALIZED' }),
    expectedBlockIntervalMs: 12_000,
    headStallThresholdMs: 12_000 * 64,
    providerRequirements: Object.freeze({
      blockHashLogs: true,
      finalizedTag: true,
      historicalStateForReconciliation: true,
    }),
  }),
  '137': Object.freeze({
    key: 'polygon',
    chainId: 137,
    finality: Object.freeze({ kind: 'RPC_FINALIZED' }),
    expectedBlockIntervalMs: 2_000,
    headStallThresholdMs: 2_000 * 128,
    providerRequirements: Object.freeze({
      blockHashLogs: true,
      finalizedTag: true,
      historicalStateForReconciliation: true,
    }),
  }),
} satisfies Record<string, ChainProfile>);

export function chainProfileForId(chainId: string | number | bigint): ChainProfile {
  const profile = profiles[String(chainId) as keyof typeof profiles];
  if (!profile) throw new Error(`UNSUPPORTED_CHAIN_PROFILE: ${String(chainId)}`);
  return profile;
}
