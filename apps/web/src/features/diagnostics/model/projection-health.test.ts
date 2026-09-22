import { describe, expect, it } from 'vitest';
import type { SystemStatus } from '@motorcove/api-contracts';
import { presentProjectionHealth } from './projection-health.js';

const status = (overrides: Partial<SystemStatus> = {}): SystemStatus => ({
  projectionStatus: 'CURRENT',
  observationFreshness: 'FRESH',
  observationAgeSeconds: '1',
  lastObservedHead: '5',
  lagBlocks: '0',
  lastObservedAt: '2026-09-22T00:00:00.000Z',
  lastRpcSuccessAt: '2026-09-22T00:00:00.000Z',
  workerHeartbeatAt: '2026-09-22T00:00:00.000Z',
  recoveryReason: null,
  ...overrides,
});

describe('projection health presentation', () => {
  it('does not present an expired CURRENT observation as current', () => {
    expect(
      presentProjectionHealth(
        status({ observationFreshness: 'STALE', observationAgeSeconds: '3600', lagBlocks: null }),
        '5',
        null,
      ),
    ).toEqual({
      healthy: false,
      text: 'Indexer observation stale · last known projection CURRENT · indexed 5 · current lag unknown',
    });
  });

  it('keeps a continuously refreshed idle worker healthy', () => {
    expect(presentProjectionHealth(status(), '5', null)).toEqual({
      healthy: true,
      text: 'Indexed block 5',
    });
  });

  it('preserves recovery-required ahead of freshness presentation', () => {
    expect(
      presentProjectionHealth(
        status({
          projectionStatus: 'RECOVERY_REQUIRED',
          observationFreshness: 'STALE',
          recoveryReason: 'CHECKPOINT_HASH_CHANGED',
          lagBlocks: null,
        }),
        '5',
        null,
      ).text,
    ).toContain('RECOVERY_REQUIRED');
  });
});
