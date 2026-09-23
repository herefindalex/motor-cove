import type { SourceAuditBlock } from '@motorcove/database/reader';
import {
  evidenceDigest,
  evidenceStringify,
  eventEnvelope,
  type RawEventIdentity,
} from '../domain/source-evidence.js';

export interface SecondaryAuditBlock {
  readonly number: bigint;
  readonly hash: `0x${string}`;
  readonly parentHash: `0x${string}`;
  readonly events: readonly RawEventIdentity[];
}

export interface SourceAuditMismatch {
  readonly blockNumber: string;
  readonly reason: string;
  readonly identity?: string;
}

export interface SourceComparison {
  readonly result: 'MATCH' | 'MISMATCH';
  readonly primaryEvidenceDigest: `0x${string}`;
  readonly secondaryEvidenceDigest: `0x${string}`;
  readonly mismatches: readonly SourceAuditMismatch[];
}

function localRawEvent(event: SourceAuditBlock['events'][number]): RawEventIdentity {
  return {
    blockNumber: BigInt(event.blockNumber),
    blockHash: event.blockHash as `0x${string}`,
    transactionHash: event.transactionHash as `0x${string}`,
    transactionIndex: event.transactionIndex,
    logIndex: event.logIndex,
    contractAddress: event.contractAddress as `0x${string}`,
    topics: event.topics as readonly `0x${string}`[],
    data: event.data as `0x${string}`,
  };
}

const ordered = (events: readonly RawEventIdentity[]) =>
  [...events].sort(
    (left, right) =>
      left.transactionIndex - right.transactionIndex || left.logIndex - right.logIndex,
  );

const logIdentity = (event: RawEventIdentity) =>
  `${event.blockHash.toLowerCase()}:${event.transactionHash.toLowerCase()}:${event.logIndex}`;

export function compareSourceEvidence(
  localBlocks: readonly SourceAuditBlock[],
  secondaryBlocks: readonly SecondaryAuditBlock[],
  fromBlock: bigint,
  toBlock: bigint,
  expectedLogScopeHash: string,
): SourceComparison {
  const mismatches: SourceAuditMismatch[] = [];
  const localByNumber = new Map(localBlocks.map((block) => [block.blockNumber, block]));
  const secondaryByNumber = new Map(
    secondaryBlocks.map((block) => [block.number.toString(), block]),
  );
  for (let number = fromBlock; number <= toBlock; number += 1n) {
    const blockNumber = number.toString();
    const local = localByNumber.get(blockNumber);
    const secondary = secondaryByNumber.get(blockNumber);
    if (!local || !secondary) {
      mismatches.push({
        blockNumber,
        reason: !local ? 'MISSING_LOCAL_BLOCK' : 'MISSING_SECONDARY_BLOCK',
      });
      continue;
    }
    if (!local.scanComplete) mismatches.push({ blockNumber, reason: 'LOCAL_SCAN_INCOMPLETE' });
    if (local.logScopeHash.toLowerCase() !== expectedLogScopeHash.toLowerCase())
      mismatches.push({ blockNumber, reason: 'LOG_SCOPE_MISMATCH' });
    if (local.blockHash.toLowerCase() !== secondary.hash.toLowerCase())
      mismatches.push({ blockNumber, reason: 'BLOCK_HASH_MISMATCH' });
    if (local.parentHash.toLowerCase() !== secondary.parentHash.toLowerCase())
      mismatches.push({ blockNumber, reason: 'PARENT_HASH_MISMATCH' });

    const localEvents = ordered(local.events.map(localRawEvent));
    const secondaryEvents = ordered(secondary.events);
    if (
      local.observedLogCount !== localEvents.length ||
      local.observedLogDigest.toLowerCase() !==
        evidenceDigest(localEvents.map(eventEnvelope)).toLowerCase()
    )
      mismatches.push({ blockNumber, reason: 'LOCAL_SOURCE_INCOMPLETE' });
    if (
      local.observedLogCount !== secondaryEvents.length ||
      local.observedLogDigest.toLowerCase() !==
        evidenceDigest(secondaryEvents.map(eventEnvelope)).toLowerCase()
    )
      mismatches.push({ blockNumber, reason: 'SCOPED_LOG_DIGEST_MISMATCH' });

    const localByIdentity = new Map(localEvents.map((event) => [logIdentity(event), event]));
    const secondaryByIdentity = new Map(
      secondaryEvents.map((event) => [logIdentity(event), event]),
    );
    for (const event of secondaryEvents) {
      const identity = logIdentity(event);
      const counterpart = localByIdentity.get(identity);
      if (!counterpart) mismatches.push({ blockNumber, reason: 'MISSING_LOCAL_LOG', identity });
      else if (
        evidenceStringify(eventEnvelope(counterpart)) !== evidenceStringify(eventEnvelope(event))
      )
        mismatches.push({ blockNumber, reason: 'LOG_CONTENT_MISMATCH', identity });
    }
    for (const event of localEvents) {
      const identity = logIdentity(event);
      if (!secondaryByIdentity.has(identity))
        mismatches.push({ blockNumber, reason: 'EXTRA_LOCAL_LOG', identity });
    }
  }
  return {
    result: mismatches.length ? 'MISMATCH' : 'MATCH',
    primaryEvidenceDigest: evidenceDigest(
      localBlocks.map((block) => ({
        number: block.blockNumber,
        hash: block.blockHash.toLowerCase(),
        parentHash: block.parentHash.toLowerCase(),
        logScopeHash: block.logScopeHash.toLowerCase(),
        count: block.observedLogCount,
        digest: block.observedLogDigest.toLowerCase(),
      })),
    ),
    secondaryEvidenceDigest: evidenceDigest(
      secondaryBlocks.map((block) => ({
        number: block.number.toString(),
        hash: block.hash.toLowerCase(),
        parentHash: block.parentHash.toLowerCase(),
        logScopeHash: expectedLogScopeHash.toLowerCase(),
        count: block.events.length,
        digest: evidenceDigest(ordered(block.events).map(eventEnvelope)),
      })),
    ),
    mismatches,
  };
}
