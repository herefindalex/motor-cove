import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { PROJECTOR_VERSION } from '@motorcove/database/types';
import type { NormalizedEvent, OrderedEvent } from '../../domain/events.js';
import {
  DECODER_VERSION,
  evidenceDigest as digest,
  evidenceStringify as stringify,
  eventEnvelope,
  sourceRecordDigest,
} from '../../domain/source-evidence.js';
import { projectOwnership } from '../../domain/projectors/ownership-projector.js';
import {
  projectPayment,
  type PaymentProjection,
} from '../../domain/projectors/payment-projector.js';
import { projectSale, type SaleProjection } from '../../domain/projectors/sale-projector.js';
import { ProjectionIntegrityError } from '../../domain/projectors/projection-integrity-error.js';
import type { BlockHeader, ProjectionUnitOfWork } from '../../ports/index.js';

export interface ProjectionMaintenanceOptions {
  readonly supportedProjectorVersions?: readonly string[];
  readonly allowLogScopeChange?: boolean;
  readonly allowReindexRecovery?: boolean;
}

type SaleRow = SaleProjection & { readonly createdBlock: number };
type PaymentRow = PaymentProjection & {
  readonly creationBlockHash: string;
  readonly creationLogIndex: number;
};

export type CommitFaultPoint =
  | 'BEFORE_BEGIN'
  | 'AFTER_EVENT_WRITES'
  | 'BEFORE_COMMIT'
  | 'AFTER_COMMIT';

class ProjectionCommitIntegrityError extends Error {
  constructor(deploymentId: string, ordered: OrderedEvent, cause: ProjectionIntegrityError) {
    super(
      `PROJECTOR_INTEGRITY: deployment=${deploymentId} event=${ordered.event.kind} ` +
        `blockHash=${ordered.blockHash} transactionHash=${ordered.transactionHash} ` +
        `logIndex=${ordered.logIndex} entity=${cause.entity}:${cause.entityId} ` +
        `missing=${cause.missingPrerequisite}`,
      { cause },
    );
    this.name = 'ProjectionCommitIntegrityError';
  }
}

export class SqliteProjectionStore implements ProjectionUnitOfWork {
  private readonly sourceScopeChanged: boolean;
  private readonly allowReindexRecovery: boolean;

  static forMaintenance(
    db: Database.Database,
    deploymentId: string,
    collectionAddress: string,
    logScopeHash: string,
    options: ProjectionMaintenanceOptions = {},
  ): SqliteProjectionStore {
    return new SqliteProjectionStore(
      db,
      deploymentId,
      collectionAddress,
      logScopeHash,
      undefined,
      options,
    );
  }

  constructor(
    private readonly db: Database.Database,
    private readonly deploymentId: string,
    private readonly collectionAddress: string,
    private readonly logScopeHash: string,
    private readonly commitFaultHook?: (point: CommitFaultPoint) => void,
    maintenance?: ProjectionMaintenanceOptions,
  ) {
    this.allowReindexRecovery = maintenance?.allowReindexRecovery === true;
    const checkpoint = this.db
      .prepare(
        'SELECT projector_version AS projectorVersion,log_scope_hash AS logScopeHash FROM indexer_checkpoint WHERE deployment_id=?',
      )
      .get(this.deploymentId) as { projectorVersion: string; logScopeHash: string } | undefined;
    if (!checkpoint) throw new Error('DEPLOYMENT_NOT_REGISTERED');
    this.sourceScopeChanged = checkpoint.logScopeHash !== this.logScopeHash;
    const projectorMatches =
      checkpoint.projectorVersion === PROJECTOR_VERSION ||
      Boolean(maintenance?.supportedProjectorVersions?.includes(checkpoint.projectorVersion));
    const scopeMatches =
      checkpoint.logScopeHash === this.logScopeHash || maintenance?.allowLogScopeChange === true;
    if (!projectorMatches || !scopeMatches)
      throw new Error(
        maintenance
          ? 'MAINTENANCE_PROJECTION_CONTRACT_UNSUPPORTED'
          : 'PROJECTION_CONTRACT_MISMATCH',
      );
  }

  async checkpoint(): Promise<BlockHeader | null> {
    const row = this.db
      .prepare(
        'SELECT last_scanned_block AS blockNumber,last_scanned_hash AS blockHash FROM indexer_checkpoint WHERE deployment_id=?',
      )
      .get(this.deploymentId) as
      | { blockNumber: number | null; blockHash: `0x${string}` | null }
      | undefined;
    if (!row || row.blockNumber === null || row.blockHash === null) return null;
    const block = this.db
      .prepare(
        'SELECT parent_hash AS parentHash,block_timestamp AS timestamp FROM indexed_blocks WHERE deployment_id=? AND block_hash=? AND is_canonical=1 AND scan_complete=1',
      )
      .get(this.deploymentId, row.blockHash) as
      | { parentHash: `0x${string}`; timestamp: number }
      | undefined;
    if (!block) throw new Error('CHECKPOINT_BLOCK_MISSING');
    return {
      number: BigInt(row.blockNumber),
      hash: row.blockHash,
      parentHash: block.parentHash,
      timestamp: BigInt(block.timestamp),
    };
  }

  async markRecoveryRequired(reason: string): Promise<void> {
    this.db
      .prepare(
        "UPDATE indexer_runtime_status SET projection_status='RECOVERY_REQUIRED',recovery_reason=?,worker_heartbeat_at=? WHERE deployment_id=?",
      )
      .run(reason, new Date().toISOString(), this.deploymentId);
  }

  async markStale(reason: string): Promise<void> {
    this.db
      .prepare(
        "UPDATE indexer_runtime_status SET projection_status='STALE',recovery_reason=?,worker_heartbeat_at=? WHERE deployment_id=? AND projection_status<>'RECOVERY_REQUIRED'",
      )
      .run(reason, new Date().toISOString(), this.deploymentId);
  }

  observe(head: bigint, eligibleHead: bigint = head): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE indexer_runtime_status
         SET projection_status=CASE WHEN projection_status IN ('UNINITIALIZED','STALE') THEN 'SYNCING' ELSE projection_status END,
          last_head_advanced_at=CASE WHEN last_observed_head IS NULL OR last_observed_head<?
            THEN ? ELSE last_head_advanced_at END,
          last_observed_head=?,last_eligible_head=?,last_observed_at=?,last_rpc_success_at=?,worker_heartbeat_at=?
         WHERE deployment_id=?`,
      )
      .run(Number(head), now, Number(head), Number(eligibleHead), now, now, now, this.deploymentId);
  }

  async markCurrent(observedHead: bigint, eligibleHead: bigint = observedHead): Promise<void> {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE indexer_runtime_status
         SET projection_status='CURRENT',recovery_reason=NULL,last_observed_head=?,
          last_eligible_head=?,last_observed_at=?,last_rpc_success_at=?,worker_heartbeat_at=?
         WHERE deployment_id=? AND projection_status IN ('CURRENT','STALE','SYNCING')`,
      )
      .run(Number(observedHead), Number(eligibleHead), now, now, now, this.deploymentId);
  }

  completeReindexRecovery(targetNumber: bigint, targetHash: string): void {
    if (!this.allowReindexRecovery) throw new Error('REINDEX_MAINTENANCE_REQUIRED');
    const checkpoint = this.db
      .prepare(
        'SELECT last_scanned_block AS blockNumber FROM indexer_checkpoint WHERE deployment_id=?',
      )
      .get(this.deploymentId) as { blockNumber: number | null } | undefined;
    if (
      checkpoint?.blockNumber === null ||
      checkpoint?.blockNumber === undefined ||
      BigInt(checkpoint.blockNumber) < targetNumber ||
      !this.hasCanonicalBlock(targetNumber, targetHash)
    ) {
      throw new Error('REINDEX_CATCHUP_INCOMPLETE');
    }
    this.db
      .prepare(
        "UPDATE indexer_runtime_status SET projection_status='SYNCING',recovery_reason=NULL WHERE deployment_id=?",
      )
      .run(this.deploymentId);
  }

  async commit(
    headers: readonly BlockHeader[],
    events: readonly OrderedEvent[],
    checkpoint: BlockHeader,
  ): Promise<void> {
    this.commitFaultHook?.('BEFORE_BEGIN');
    const commit = this.db.transaction(() => {
      const recovery = this.db
        .prepare(
          'SELECT projection_status AS status,recovery_reason AS reason FROM indexer_runtime_status WHERE deployment_id=?',
        )
        .get(this.deploymentId) as { status: string; reason: string | null } | undefined;
      if (recovery?.status === 'RECOVERY_REQUIRED' && !this.allowReindexRecovery) {
        throw new Error(`PROJECTION_RECOVERY_REQUIRED: ${recovery.reason ?? 'UNKNOWN'}`);
      }
      const recanonicalizedBlocks = new Set<string>();
      for (const header of headers) {
        const blockEvents = events
          .filter((event) => event.blockNumber === header.number)
          .sort(
            (left, right) =>
              left.transactionIndex - right.transactionIndex || left.logIndex - right.logIndex,
          );
        const observedDigest = digest(blockEvents.map(eventEnvelope));
        const existing = this.db
          .prepare(
            `SELECT observed_log_count AS observedLogCount,
            observed_log_digest AS observedLogDigest,
            log_scope_hash AS logScopeHash,
            parent_hash AS parentHash,
            is_canonical AS isCanonical
             FROM indexed_blocks WHERE deployment_id=? AND block_hash=?`,
          )
          .get(this.deploymentId, header.hash) as
          | {
              observedLogCount: number;
              observedLogDigest: string;
              logScopeHash: string;
              parentHash: string;
              isCanonical: number;
            }
          | undefined;
        if (existing) {
          if (
            existing.observedLogCount !== blockEvents.length ||
            existing.observedLogDigest !== observedDigest ||
            existing.logScopeHash !== this.logScopeHash ||
            existing.parentHash !== header.parentHash
          )
            throw new Error('COMPLETED_BLOCK_CONTENT_MISMATCH');
          if (existing.isCanonical !== 1) {
            this.db
              .prepare(
                `UPDATE indexed_blocks
                 SET is_canonical=1,scan_complete=1
                 WHERE deployment_id=? AND block_hash=?`,
              )
              .run(this.deploymentId, header.hash.toLowerCase());
            recanonicalizedBlocks.add(header.hash.toLowerCase());
          }
        } else {
          this.db
            .prepare(
              `INSERT INTO indexed_blocks(
                deployment_id,block_hash,block_number,parent_hash,block_timestamp,
                is_canonical,scan_complete,log_scope_hash,observed_log_count,observed_log_digest
              ) VALUES (?,?,?,?,?,1,1,?,?,?)`,
            )
            .run(
              this.deploymentId,
              header.hash.toLowerCase(),
              Number(header.number),
              header.parentHash.toLowerCase(),
              Number(header.timestamp),
              this.logScopeHash,
              blockEvents.length,
              observedDigest,
            );
        }
      }

      for (const ordered of events)
        this.recordEvent(ordered, recanonicalizedBlocks.has(ordered.blockHash.toLowerCase()));
      this.commitFaultHook?.('AFTER_EVENT_WRITES');

      this.db
        .prepare(
          `UPDATE indexer_checkpoint
           SET last_scanned_block=?,last_scanned_hash=?,updated_at=?
           WHERE deployment_id=?`,
        )
        .run(
          Number(checkpoint.number),
          checkpoint.hash.toLowerCase(),
          new Date().toISOString(),
          this.deploymentId,
        );
      this.db
        .prepare('UPDATE indexer_runtime_status SET worker_heartbeat_at=? WHERE deployment_id=?')
        .run(new Date().toISOString(), this.deploymentId);
      this.commitFaultHook?.('BEFORE_COMMIT');
    });
    try {
      commit();
    } catch (error) {
      if (error instanceof ProjectionCommitIntegrityError)
        this.db
          .prepare(
            "UPDATE indexer_runtime_status SET projection_status='RECOVERY_REQUIRED',recovery_reason='PROJECTOR_INTEGRITY',worker_heartbeat_at=? WHERE deployment_id=?",
          )
          .run(new Date().toISOString(), this.deploymentId);
      throw error;
    }
    this.commitFaultHook?.('AFTER_COMMIT');
  }

  rebuildFromJournal(): { projectionBuildId: string; events: number } {
    const projectionBuildId = randomUUID();
    const preserveRecoveryBarrier =
      this.allowReindexRecovery &&
      Boolean(
        this.db
          .prepare(
            "SELECT 1 FROM indexer_runtime_status WHERE deployment_id=? AND projection_status='RECOVERY_REQUIRED'",
          )
          .get(this.deploymentId),
      );
    try {
      this.verifyRebuildSource();
      return this.db.transaction(() => {
        if (!preserveRecoveryBarrier)
          this.db
            .prepare(
              "UPDATE indexer_runtime_status SET projection_status='REBUILDING',recovery_reason=NULL WHERE deployment_id=?",
            )
            .run(this.deploymentId);
        this.db.prepare('DELETE FROM payment_claims WHERE deployment_id=?').run(this.deploymentId);
        this.db.prepare('DELETE FROM sales WHERE deployment_id=?').run(this.deploymentId);
        this.db.prepare('DELETE FROM token_ownership WHERE deployment_id=?').run(this.deploymentId);
        const rows = this.db
          .prepare(
            `SELECT e.block_number AS blockNumber,e.block_hash AS blockHash,
                    e.tx_hash AS transactionHash,e.transaction_index AS transactionIndex,
                    e.log_index AS logIndex,e.contract_address AS contractAddress,
                    e.topics_json AS topics,e.data,e.decoded_json AS decoded
             FROM chain_events e
             JOIN indexed_blocks b
               ON b.deployment_id=e.deployment_id AND b.block_hash=e.block_hash
             WHERE e.deployment_id=? AND b.is_canonical=1 AND b.scan_complete=1
             ORDER BY e.block_number,e.transaction_index,e.log_index`,
          )
          .all(this.deploymentId) as Array<{
          blockNumber: number;
          blockHash: `0x${string}`;
          transactionHash: `0x${string}`;
          transactionIndex: number;
          logIndex: number;
          contractAddress: `0x${string}`;
          topics: string;
          data: `0x${string}`;
          decoded: string;
        }>;
        for (const row of rows)
          this.applyEvent({
            blockNumber: BigInt(row.blockNumber),
            blockHash: row.blockHash,
            transactionHash: row.transactionHash,
            transactionIndex: row.transactionIndex,
            logIndex: row.logIndex,
            contractAddress: row.contractAddress,
            topics: JSON.parse(row.topics) as readonly `0x${string}`[],
            data: row.data,
            event: JSON.parse(row.decoded) as NormalizedEvent,
          });
        this.db
          .prepare(
            `UPDATE indexer_checkpoint
             SET projector_version=?,projection_build_id=?,log_scope_hash=?,updated_at=?
             WHERE deployment_id=?`,
          )
          .run(
            PROJECTOR_VERSION,
            projectionBuildId,
            this.logScopeHash,
            new Date().toISOString(),
            this.deploymentId,
          );
        if (!preserveRecoveryBarrier)
          this.db
            .prepare(
              "UPDATE indexer_runtime_status SET projection_status='CURRENT' WHERE deployment_id=?",
            )
            .run(this.deploymentId);
        return { projectionBuildId, events: rows.length };
      })();
    } catch (error) {
      const reason =
        error instanceof Error && error.message.startsWith('REBUILD_SOURCE_INCOMPLETE')
          ? 'REBUILD_SOURCE_INCOMPLETE'
          : 'REBUILD_FAILED';
      this.db
        .prepare(
          "UPDATE indexer_runtime_status SET projection_status='RECOVERY_REQUIRED',recovery_reason=? WHERE deployment_id=?",
        )
        .run(reason, this.deploymentId);
      throw error;
    }
  }

  hasCanonicalBlock(number: bigint, hash: string): boolean {
    return Boolean(
      this.db
        .prepare(
          'SELECT 1 FROM indexed_blocks WHERE deployment_id=? AND block_number=? AND block_hash=? AND is_canonical=1 AND scan_complete=1',
        )
        .get(this.deploymentId, Number(number), hash.toLowerCase()),
    );
  }

  private markReindexStarted(reason: string): void {
    this.db
      .prepare(
        `UPDATE indexer_runtime_status SET
           projection_status=CASE WHEN ?=1 AND projection_status='RECOVERY_REQUIRED'
             THEN projection_status ELSE 'REBUILD_REQUIRED' END,
           recovery_reason=CASE WHEN ?=1 AND projection_status='RECOVERY_REQUIRED'
             THEN recovery_reason ELSE ? END
         WHERE deployment_id=?`,
      )
      .run(
        this.allowReindexRecovery ? 1 : 0,
        this.allowReindexRecovery ? 1 : 0,
        reason,
        this.deploymentId,
      );
  }

  rewindFrom(blockNumber: bigint): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          'UPDATE indexed_blocks SET is_canonical=0 WHERE deployment_id=? AND block_number>=? AND is_canonical=1',
        )
        .run(this.deploymentId, Number(blockNumber));
      const previous = this.db
        .prepare(
          `SELECT block_number AS blockNumber,block_hash AS blockHash
           FROM indexed_blocks
           WHERE deployment_id=? AND is_canonical=1 AND scan_complete=1 AND block_number<?
           ORDER BY block_number DESC LIMIT 1`,
        )
        .get(this.deploymentId, Number(blockNumber)) as
        | { blockNumber: number; blockHash: string }
        | undefined;
      this.db
        .prepare(
          `UPDATE indexer_checkpoint
           SET last_scanned_block=?,last_scanned_hash=?,updated_at=?
           WHERE deployment_id=?`,
        )
        .run(
          previous?.blockNumber ?? null,
          previous?.blockHash ?? null,
          new Date().toISOString(),
          this.deploymentId,
        );
      this.markReindexStarted('REINDEX_REQUESTED');
    })();
  }

  requiresSourceRefresh(): boolean {
    return this.sourceScopeChanged || this.hasSourceContentMismatch();
  }

  prepareForReindex(
    blockNumber: bigint,
    sourceArchive?: { readonly verifiedBackupId: string },
  ): void {
    if (!this.requiresSourceRefresh()) {
      this.rewindFrom(blockNumber);
      return;
    }
    if (!sourceArchive?.verifiedBackupId) throw new Error('SOURCE_REFRESH_ARCHIVE_REQUIRED');
    const deployment = this.db
      .prepare('SELECT scan_start_block AS scanStartBlock FROM deployments WHERE deployment_id=?')
      .get(this.deploymentId) as { scanStartBlock: number } | undefined;
    if (!deployment || BigInt(deployment.scanStartBlock) !== blockNumber)
      throw new Error('SOURCE_REFRESH_REINDEX_MUST_START_AT_DEPLOYMENT');
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM chain_events WHERE deployment_id=?').run(this.deploymentId);
      this.db.prepare('DELETE FROM indexed_blocks WHERE deployment_id=?').run(this.deploymentId);
      this.db
        .prepare(
          `UPDATE indexer_checkpoint
           SET last_scanned_block=NULL,last_scanned_hash=NULL,updated_at=?
           WHERE deployment_id=?`,
        )
        .run(new Date().toISOString(), this.deploymentId);
      this.markReindexStarted('SOURCE_REFRESH_REINDEX_REQUESTED');
    })();
  }

  private hasSourceContentMismatch(): boolean {
    const rows = this.db
      .prepare(
        `SELECT block_number AS blockNumber,block_hash AS blockHash,tx_hash AS transactionHash,
                transaction_index AS transactionIndex,log_index AS logIndex,
                contract_address AS contractAddress,topics_json AS topics,data,
                raw_envelope_digest AS rawEnvelopeDigest,decoded_json AS decodedJson,
                decoder_version AS decoderVersion,source_record_digest AS sourceRecordDigest
         FROM chain_events WHERE deployment_id=?
         ORDER BY block_hash,transaction_index,log_index`,
      )
      .all(this.deploymentId) as Array<{
      blockNumber: number;
      blockHash: `0x${string}`;
      transactionHash: `0x${string}`;
      transactionIndex: number;
      logIndex: number;
      contractAddress: `0x${string}`;
      topics: string;
      data: `0x${string}`;
      rawEnvelopeDigest: string;
      decodedJson: string;
      decoderVersion: string;
      sourceRecordDigest: string | null;
    }>;
    const eventsByBlock = new Map<string, OrderedEvent[]>();
    for (const row of rows) {
      let ordered: OrderedEvent;
      try {
        ordered = {
          blockNumber: BigInt(row.blockNumber),
          blockHash: row.blockHash,
          transactionHash: row.transactionHash,
          transactionIndex: row.transactionIndex,
          logIndex: row.logIndex,
          contractAddress: row.contractAddress,
          topics: JSON.parse(row.topics) as readonly `0x${string}`[],
          data: row.data,
          event: JSON.parse(row.decodedJson) as NormalizedEvent,
        };
      } catch {
        return true;
      }
      if (
        row.decoderVersion !== DECODER_VERSION ||
        row.rawEnvelopeDigest !== digest(eventEnvelope(ordered)) ||
        row.sourceRecordDigest !== sourceRecordDigest(ordered)
      )
        return true;
      const blockEvents = eventsByBlock.get(row.blockHash) ?? [];
      blockEvents.push(ordered);
      eventsByBlock.set(row.blockHash, blockEvents);
    }

    const blocks = this.db
      .prepare(
        `SELECT block_hash AS blockHash,observed_log_count AS observedLogCount,
                observed_log_digest AS observedLogDigest
         FROM indexed_blocks WHERE deployment_id=? AND scan_complete=1`,
      )
      .all(this.deploymentId) as Array<{
      blockHash: string;
      observedLogCount: number;
      observedLogDigest: string;
    }>;
    for (const block of blocks) {
      const events = eventsByBlock.get(block.blockHash) ?? [];
      if (events.length > block.observedLogCount) return true;
      if (
        events.length === block.observedLogCount &&
        digest(events.map(eventEnvelope)) !== block.observedLogDigest
      )
        return true;
    }
    return false;
  }

  private verifyRebuildSource(): void {
    const checkpoint = this.db
      .prepare(
        'SELECT last_scanned_block AS blockNumber,last_scanned_hash AS blockHash FROM indexer_checkpoint WHERE deployment_id=?',
      )
      .get(this.deploymentId) as
      | { blockNumber: number | null; blockHash: string | null }
      | undefined;
    if (!checkpoint) throw new Error('REBUILD_SOURCE_INCOMPLETE: checkpoint missing');
    if (checkpoint.blockNumber === null || checkpoint.blockHash === null) {
      const canonical = this.db
        .prepare(
          'SELECT COUNT(*) AS count FROM indexed_blocks WHERE deployment_id=? AND is_canonical=1',
        )
        .get(this.deploymentId) as { count: number };
      if (canonical.count !== 0) throw new Error('REBUILD_SOURCE_INCOMPLETE: checkpoint coverage');
      return;
    }

    const deployment = this.db
      .prepare('SELECT scan_start_block AS scanStartBlock FROM deployments WHERE deployment_id=?')
      .get(this.deploymentId) as { scanStartBlock: number } | undefined;
    if (!deployment) throw new Error('REBUILD_SOURCE_INCOMPLETE: deployment missing');
    const blocks = this.db
      .prepare(
        `SELECT block_number AS blockNumber,block_hash AS blockHash,parent_hash AS parentHash,
                observed_log_count AS observedLogCount,observed_log_digest AS observedLogDigest
         FROM indexed_blocks
         WHERE deployment_id=? AND is_canonical=1 AND scan_complete=1 AND block_number<=?
         ORDER BY block_number`,
      )
      .all(this.deploymentId, checkpoint.blockNumber) as Array<{
      blockNumber: number;
      blockHash: string;
      parentHash: string;
      observedLogCount: number;
      observedLogDigest: string;
    }>;
    const expectedCount = checkpoint.blockNumber - deployment.scanStartBlock + 1;
    if (
      expectedCount < 1 ||
      blocks.length !== expectedCount ||
      blocks[0]?.blockNumber !== deployment.scanStartBlock ||
      blocks.at(-1)?.blockHash !== checkpoint.blockHash
    )
      throw new Error('REBUILD_SOURCE_INCOMPLETE: canonical coverage');

    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index];
      if (
        !block ||
        block.blockNumber !== deployment.scanStartBlock + index ||
        (index > 0 && block.parentHash !== blocks[index - 1]?.blockHash)
      )
        throw new Error('REBUILD_SOURCE_INCOMPLETE: canonical continuity');
      const rows = this.db
        .prepare(
          `SELECT block_number AS blockNumber,block_hash AS blockHash,tx_hash AS transactionHash,
                  transaction_index AS transactionIndex,log_index AS logIndex,
                  contract_address AS contractAddress,topics_json AS topics,data,
                  raw_envelope_digest AS rawEnvelopeDigest,decoded_json AS decodedJson,
                  decoder_version AS decoderVersion,source_record_digest AS sourceRecordDigest
           FROM chain_events WHERE deployment_id=? AND block_hash=?
           ORDER BY transaction_index,log_index`,
        )
        .all(this.deploymentId, block.blockHash) as Array<{
        blockNumber: number;
        blockHash: `0x${string}`;
        transactionHash: `0x${string}`;
        transactionIndex: number;
        logIndex: number;
        contractAddress: `0x${string}`;
        topics: string;
        data: `0x${string}`;
        rawEnvelopeDigest: string;
        decodedJson: string;
        decoderVersion: string;
        sourceRecordDigest: string | null;
      }>;
      let ordered: OrderedEvent[];
      try {
        ordered = rows.map((row) => ({
          blockNumber: BigInt(row.blockNumber),
          blockHash: row.blockHash,
          transactionHash: row.transactionHash,
          transactionIndex: row.transactionIndex,
          logIndex: row.logIndex,
          contractAddress: row.contractAddress,
          topics: JSON.parse(row.topics) as readonly `0x${string}`[],
          data: row.data,
          event: JSON.parse(row.decodedJson) as NormalizedEvent,
        }));
      } catch {
        throw new Error('REBUILD_SOURCE_INCOMPLETE: event encoding');
      }
      if (
        ordered.length !== block.observedLogCount ||
        digest(ordered.map(eventEnvelope)) !== block.observedLogDigest ||
        ordered.some(
          (event, rowIndex) =>
            rows[rowIndex]?.decoderVersion !== DECODER_VERSION ||
            rows[rowIndex]?.rawEnvelopeDigest !== digest(eventEnvelope(event)) ||
            rows[rowIndex]?.sourceRecordDigest !== sourceRecordDigest(event),
        )
      )
        throw new Error('REBUILD_SOURCE_INCOMPLETE: event evidence');
    }
  }

  private recordEvent(ordered: OrderedEvent, applyExisting = false): void {
    const rawEnvelopeDigest = digest(eventEnvelope(ordered));
    const decodedJson = stringify(ordered.event);
    const recordDigest = sourceRecordDigest(ordered);
    const existing = this.db
      .prepare(
        `SELECT raw_envelope_digest AS rawEnvelopeDigest,decoded_json AS decodedJson,
                decoder_version AS decoderVersion,source_record_digest AS sourceRecordDigest
         FROM chain_events WHERE deployment_id=? AND block_hash=? AND log_index=?`,
      )
      .get(this.deploymentId, ordered.blockHash, ordered.logIndex) as
      | {
          rawEnvelopeDigest: string;
          decodedJson: string;
          decoderVersion: string;
          sourceRecordDigest: string | null;
        }
      | undefined;
    if (existing) {
      if (
        existing.rawEnvelopeDigest !== rawEnvelopeDigest ||
        existing.decodedJson !== decodedJson ||
        existing.decoderVersion !== DECODER_VERSION ||
        existing.sourceRecordDigest !== recordDigest
      )
        throw new Error('EVENT_IDENTITY_CONTENT_MISMATCH');
      if (applyExisting) this.applyEvent(ordered);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO chain_events(
          deployment_id,block_hash,log_index,block_number,tx_hash,transaction_index,
          contract_address,topics_json,data,raw_envelope_digest,decoded_json,decoder_version,
          source_record_digest,first_seen_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        this.deploymentId,
        ordered.blockHash.toLowerCase(),
        ordered.logIndex,
        Number(ordered.blockNumber),
        ordered.transactionHash.toLowerCase(),
        ordered.transactionIndex,
        ordered.contractAddress.toLowerCase(),
        stringify(ordered.topics.map((topic) => topic.toLowerCase())),
        ordered.data.toLowerCase(),
        rawEnvelopeDigest,
        decodedJson,
        DECODER_VERSION,
        recordDigest,
        new Date().toISOString(),
      );
    this.applyEvent(ordered);
  }

  private applyEvent(ordered: OrderedEvent): void {
    if (ordered.event.kind === 'Transfer') {
      const current = this.db
        .prepare(
          'SELECT owner FROM token_ownership WHERE deployment_id=? AND collection_address=? AND token_id=?',
        )
        .get(this.deploymentId, ordered.contractAddress.toLowerCase(), ordered.event.tokenId) as
        | { owner: string }
        | undefined;
      const owner = projectOwnership(current?.owner, ordered.event);
      if (!owner) throw new Error('OWNERSHIP_PROJECTION_MISSING_OWNER');
      this.db
        .prepare(
          `INSERT INTO token_ownership(
            deployment_id,collection_address,token_id,owner,last_transfer_block_hash,
            last_transfer_log_index,updated_block
          ) VALUES (?,?,?,?,?,?,?)
          ON CONFLICT(deployment_id,collection_address,token_id) DO UPDATE SET
            owner=excluded.owner,last_transfer_block_hash=excluded.last_transfer_block_hash,
            last_transfer_log_index=excluded.last_transfer_log_index,updated_block=excluded.updated_block`,
        )
        .run(
          this.deploymentId,
          ordered.contractAddress.toLowerCase(),
          ordered.event.tokenId,
          owner.toLowerCase(),
          ordered.blockHash.toLowerCase(),
          ordered.logIndex,
          Number(ordered.blockNumber),
        );
      return;
    }

    if ('saleId' in ordered.event) {
      const currentClaim = this.db
        .prepare(
          `SELECT sale_id AS saleId,beneficiary,amount_wei AS amountWei,kind,status,
                  withdrawal_recipient AS recipient,creation_block_hash AS creationBlockHash,
                  creation_log_index AS creationLogIndex
           FROM payment_claims WHERE deployment_id=? AND sale_id=?`,
        )
        .get(this.deploymentId, ordered.event.saleId) as PaymentRow | undefined;
      let nextClaim: PaymentProjection | undefined;
      try {
        nextClaim = projectPayment(currentClaim, ordered.event);
      } catch (error) {
        if (error instanceof ProjectionIntegrityError)
          throw new ProjectionCommitIntegrityError(this.deploymentId, ordered, error);
        throw error;
      }
      if (nextClaim && nextClaim !== currentClaim) {
        const creationBlockHash = currentClaim?.creationBlockHash ?? ordered.blockHash;
        const creationLogIndex = currentClaim?.creationLogIndex ?? ordered.logIndex;
        const withdrawn = nextClaim.status === 'WITHDRAWN';
        this.db
          .prepare(
            `INSERT INTO payment_claims(
              deployment_id,sale_id,beneficiary,amount_wei,kind,status,withdrawal_recipient,
              creation_block_hash,creation_log_index,withdrawal_block_hash,withdrawal_log_index
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(deployment_id,sale_id) DO UPDATE SET
              status=excluded.status,withdrawal_recipient=excluded.withdrawal_recipient,
              withdrawal_block_hash=excluded.withdrawal_block_hash,
              withdrawal_log_index=excluded.withdrawal_log_index`,
          )
          .run(
            this.deploymentId,
            nextClaim.saleId,
            nextClaim.beneficiary.toLowerCase(),
            nextClaim.amountWei,
            nextClaim.kind,
            nextClaim.status,
            nextClaim.recipient?.toLowerCase() ?? null,
            creationBlockHash.toLowerCase(),
            creationLogIndex,
            withdrawn ? ordered.blockHash.toLowerCase() : null,
            withdrawn ? ordered.logIndex : null,
          );
      }

      const currentSale = this.db
        .prepare(
          `SELECT sale_id AS saleId,token_id AS tokenId,seller,allowed_buyer AS allowedBuyer,buyer,price_wei AS priceWei,
                  CAST(funded_at AS TEXT) AS fundedAt,CAST(expires_at AS TEXT) AS expiresAt,
                  status,token_reclaimed AS tokenReclaimed,created_block AS createdBlock
           FROM sales WHERE deployment_id=? AND sale_id=?`,
        )
        .get(this.deploymentId, ordered.event.saleId) as
        | (Omit<SaleRow, 'tokenReclaimed'> & { tokenReclaimed: number })
        | undefined;
      const saleProjection = currentSale
        ? { ...currentSale, tokenReclaimed: currentSale.tokenReclaimed === 1 }
        : undefined;
      let nextSale: SaleProjection | undefined;
      try {
        nextSale = projectSale(saleProjection, ordered.event);
      } catch (error) {
        if (error instanceof ProjectionIntegrityError)
          throw new ProjectionCommitIntegrityError(this.deploymentId, ordered, error);
        throw error;
      }
      if (nextSale && nextSale !== saleProjection) {
        this.db
          .prepare(
            `INSERT INTO sales(
            deployment_id,sale_id,collection_address,token_id,seller,allowed_buyer,buyer,price_wei,
              status,funded_at,expires_at,created_block,updated_block,last_event_block_hash,
              last_event_log_index,token_reclaimed
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(deployment_id,sale_id) DO UPDATE SET
              buyer=excluded.buyer,status=excluded.status,funded_at=excluded.funded_at,
              expires_at=excluded.expires_at,updated_block=excluded.updated_block,
              last_event_block_hash=excluded.last_event_block_hash,
              last_event_log_index=excluded.last_event_log_index,
              token_reclaimed=excluded.token_reclaimed`,
          )
          .run(
            this.deploymentId,
            nextSale.saleId,
            this.collectionAddress.toLowerCase(),
            nextSale.tokenId,
            nextSale.seller.toLowerCase(),
            nextSale.allowedBuyer.toLowerCase(),
            nextSale.buyer?.toLowerCase() ?? null,
            nextSale.priceWei,
            nextSale.status,
            nextSale.fundedAt === null ? null : Number(nextSale.fundedAt),
            nextSale.expiresAt === null ? null : Number(nextSale.expiresAt),
            currentSale?.createdBlock ?? Number(ordered.blockNumber),
            Number(ordered.blockNumber),
            ordered.blockHash.toLowerCase(),
            ordered.logIndex,
            nextSale.tokenReclaimed ? 1 : 0,
          );
      }
    }
  }
}
