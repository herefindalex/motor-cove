import { describe, expect, it } from 'vitest';
import type { SourceAuditBlock } from '@motorcove/database/reader';
import { evidenceDigest, eventEnvelope, type RawEventIdentity } from '../domain/source-evidence.js';
import { compareSourceEvidence, type SecondaryAuditBlock } from './source-audit.js';

const hash = (digit: string): `0x${string}` => `0x${digit.repeat(64)}`;
const address = `0x${'a'.repeat(40)}` as const;
const event: RawEventIdentity = {
  blockNumber: 5n,
  blockHash: hash('5'),
  transactionHash: hash('6'),
  transactionIndex: 0,
  logIndex: 0,
  contractAddress: address,
  topics: [hash('7')],
  data: '0x',
};
const local: SourceAuditBlock = {
  blockNumber: '5',
  blockHash: event.blockHash,
  parentHash: hash('4'),
  scanComplete: true,
  logScopeHash: hash('8'),
  observedLogCount: 1,
  observedLogDigest: evidenceDigest([eventEnvelope(event)]),
  events: [
    {
      blockNumber: '5',
      blockHash: event.blockHash,
      transactionHash: event.transactionHash,
      transactionIndex: 0,
      logIndex: 0,
      contractAddress: address,
      topics: event.topics,
      data: '0x',
    },
  ],
};
const secondary: SecondaryAuditBlock = {
  number: 5n,
  hash: event.blockHash,
  parentHash: hash('4'),
  events: [event],
};

describe('independent source evidence comparison', () => {
  it('matches equal block and raw-log evidence', () => {
    const result = compareSourceEvidence([local], [secondary], 5n, 5n, local.logScopeHash);
    expect(result.primaryEvidenceDigest).toBe(result.secondaryEvidenceDigest);
    expect(result).toMatchObject({
      result: 'MATCH',
      mismatches: [],
    });
  });

  it('detects a secondary log absent from local source', () => {
    const added = { ...event, transactionHash: hash('9'), logIndex: 1 };
    const result = compareSourceEvidence(
      [local],
      [{ ...secondary, events: [event, added] }],
      5n,
      5n,
      local.logScopeHash,
    );
    expect(result.result).toBe('MISMATCH');
    expect(result.mismatches).toContainEqual(
      expect.objectContaining({ reason: 'MISSING_LOCAL_LOG' }),
    );
  });

  it('detects a local log absent from secondary source', () => {
    const result = compareSourceEvidence(
      [local],
      [{ ...secondary, events: [] }],
      5n,
      5n,
      local.logScopeHash,
    );
    expect(result.result).toBe('MISMATCH');
    expect(result.mismatches).toContainEqual(
      expect.objectContaining({ reason: 'EXTRA_LOCAL_LOG' }),
    );
  });

  it('detects a block hash mismatch even when both log sets are empty', () => {
    const empty = {
      ...local,
      observedLogCount: 0,
      observedLogDigest: evidenceDigest([]),
      events: [],
    };
    const result = compareSourceEvidence(
      [empty],
      [{ ...secondary, hash: hash('a'), events: [] }],
      5n,
      5n,
      local.logScopeHash,
    );
    expect(result.result).toBe('MISMATCH');
    expect(result.mismatches).toContainEqual(
      expect.objectContaining({ reason: 'BLOCK_HASH_MISMATCH' }),
    );
  });
});
