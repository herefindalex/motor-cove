import { existsSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { acquireRuntimeLocks } from '../connection/flock.js';
import { verifyOwnedEnvironment } from '../connection/environment.js';
import { openReadOnlyDatabase } from '../connection/sqlite.js';
import { parseUint256 } from '../codecs/uint256.js';
import type { EnvironmentPaths, ProjectionProvenance } from '../types/index.js';
import { verifyDatabase } from '../maintenance/migrations.js';
import type {
  DeploymentDescriptor,
  EventRecord,
  FundingObservationRecord,
  ReadModelReader,
  ReconciliationRecord,
  ReadSnapshot,
  SaleRecord,
  SystemRecord,
  VehicleRecord,
} from './types.js';

type SaleRow = Omit<SaleRecord, 'tokenReclaimed' | 'claim' | 'metadataStatus' | 'catalogId'> & {
  tokenReclaimed: number;
  claimBeneficiary: string | null;
  claimAmountWei: string | null;
  claimKind: string | null;
  claimStatus: string | null;
  catalogId: string | null;
};

interface BlockRow {
  blockNumber: number;
  blockHash: string;
  isCanonical: number;
  scanComplete: number;
  logScopeHash: string;
}

interface EventRow {
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
  contractAddress: string;
  decodedJson: string;
}

interface SaleFundedDecoded {
  readonly kind: 'SaleFunded';
  readonly saleId: string;
  readonly buyer: string;
  readonly amountWei: string;
  readonly fundedAt: string;
  readonly expiresAt: string;
}

function readProvenance(db: Database.Database, deploymentId: string): ProjectionProvenance {
  const row = db
    .prepare(
      'SELECT last_scanned_block,last_scanned_hash,projector_version,projection_build_id,log_scope_hash FROM indexer_checkpoint WHERE deployment_id=?',
    )
    .get(deploymentId) as
    | {
        last_scanned_block: number | null;
        last_scanned_hash: string | null;
        projector_version: string;
        projection_build_id: string;
        log_scope_hash: string;
      }
    | undefined;
  if (!row || row.last_scanned_block === null || row.last_scanned_hash === null)
    throw new Error('READ_MODEL_UNINITIALIZED');
  return {
    deploymentId,
    indexedBlockNumber: String(row.last_scanned_block),
    indexedBlockHash: row.last_scanned_hash,
    projectorVersion: row.projector_version,
    projectionBuildId: row.projection_build_id,
    logScopeHash: row.log_scope_hash,
  };
}

function readSystemRecord(
  db: Database.Database,
  deploymentId: string,
  provenance: ProjectionProvenance,
  now: Date,
  heartbeatStaleAfterMs: number,
): SystemRecord {
  const status = db
    .prepare(
      `SELECT projection_status AS projectionStatus,
              CAST(last_observed_head AS TEXT) AS lastObservedHead,
              last_observed_at AS lastObservedAt,last_rpc_success_at AS lastRpcSuccessAt,
              worker_heartbeat_at AS workerHeartbeatAt,recovery_reason AS recoveryReason
       FROM indexer_runtime_status WHERE deployment_id=?`,
    )
    .get(deploymentId) as Omit<SystemRecord, 'lagBlocks'>;
  const heartbeatTime = status.workerHeartbeatAt
    ? Date.parse(status.workerHeartbeatAt)
    : Number.NaN;
  const nowTime = now.getTime();
  const heartbeatAgeMs =
    Number.isFinite(heartbeatTime) && Number.isFinite(nowTime) && heartbeatTime <= nowTime
      ? nowTime - heartbeatTime
      : null;
  const observationFreshness =
    heartbeatAgeMs === null
      ? 'UNKNOWN'
      : heartbeatAgeMs > heartbeatStaleAfterMs
        ? 'STALE'
        : 'FRESH';
  const lagBlocks =
    observationFreshness !== 'FRESH' || status.lastObservedHead === null
      ? null
      : String(
          BigInt(status.lastObservedHead) > BigInt(provenance.indexedBlockNumber)
            ? BigInt(status.lastObservedHead) - BigInt(provenance.indexedBlockNumber)
            : 0n,
        );
  return {
    ...status,
    observationFreshness,
    observationAgeSeconds:
      heartbeatAgeMs === null ? null : String(Math.floor(heartbeatAgeMs / 1_000)),
    lagBlocks,
  };
}

function parseSaleFunded(value: string): SaleFundedDecoded | null {
  try {
    const decoded = JSON.parse(value) as Record<string, unknown>;
    if (
      decoded['kind'] !== 'SaleFunded' ||
      typeof decoded['saleId'] !== 'string' ||
      typeof decoded['buyer'] !== 'string' ||
      typeof decoded['amountWei'] !== 'string' ||
      typeof decoded['fundedAt'] !== 'string' ||
      typeof decoded['expiresAt'] !== 'string'
    )
      return null;
    return {
      kind: 'SaleFunded',
      saleId: decoded['saleId'],
      buyer: decoded['buyer'],
      amountWei: decoded['amountWei'],
      fundedAt: decoded['fundedAt'],
      expiresAt: decoded['expiresAt'],
    };
  } catch {
    return null;
  }
}

export interface ReadObservationHooks {
  readonly afterFundingBaseRead?: () => void;
  readonly now?: () => Date;
  readonly heartbeatStaleAfterMs?: number;
}

export const DEFAULT_WORKER_HEARTBEAT_STALE_AFTER_MS = 30_000;

export async function createReadOnlyReader(
  paths: EnvironmentPaths,
  deploymentId: string,
  hooks: ReadObservationHooks = {},
): Promise<ReadModelReader> {
  const heartbeatStaleAfterMs =
    hooks.heartbeatStaleAfterMs ?? DEFAULT_WORKER_HEARTBEAT_STALE_AFTER_MS;
  if (!Number.isSafeInteger(heartbeatStaleAfterMs) || heartbeatStaleAfterMs <= 0)
    throw new Error('INVALID_HEARTBEAT_STALE_THRESHOLD');
  verifyOwnedEnvironment(paths);
  const locks = await acquireRuntimeLocks(paths, false);
  try {
    if (existsSync(paths.maintenancePath)) throw new Error('MAINTENANCE_INCOMPLETE');
    const db = openReadOnlyDatabase(paths.databasePath);
    verifyDatabase(db);
    const deployment = db
      .prepare(
        `SELECT deployment_id AS deploymentId,chain_id AS chainId,nft_address AS nftAddress,
                escrow_address AS escrowAddress,protocol_version AS protocolVersion,
                abi_bundle_hash AS abiBundleHash,scan_start_block AS scanStartBlock,
                nft_deployment_block AS nftDeploymentBlock,nft_deployment_hash AS nftDeploymentHash,
                nft_runtime_code_hash AS nftRuntimeCodeHash,
                escrow_deployment_block AS escrowDeploymentBlock,
                escrow_deployment_hash AS escrowDeploymentHash,
                escrow_runtime_code_hash AS escrowRuntimeCodeHash,manifest_hash AS manifestHash,
                manifest_json AS manifestJson
         FROM deployments WHERE deployment_id=?`,
      )
      .get(deploymentId) as DeploymentDescriptor | undefined;
    if (!deployment) {
      db.close();
      throw new Error('DEPLOYMENT_MISMATCH');
    }

    const snapshot = <T>(query: () => T): ReadSnapshot<T> =>
      db.transaction(() => ({ data: query(), provenance: readProvenance(db, deploymentId) }))();
    const selectSales = `SELECT s.sale_id AS saleId,s.token_id AS tokenId,s.seller,s.buyer,
      s.price_wei AS priceWei,CAST(s.funded_at AS TEXT) AS fundedAt,
      CAST(s.expires_at AS TEXT) AS expiresAt,s.status,s.token_reclaimed AS tokenReclaimed,
      p.beneficiary AS claimBeneficiary,p.amount_wei AS claimAmountWei,p.kind AS claimKind,
      p.status AS claimStatus,b.catalog_id AS catalogId
      FROM sales s
      LEFT JOIN payment_claims p ON p.deployment_id=s.deployment_id AND p.sale_id=s.sale_id
      LEFT JOIN catalog_asset_bindings b ON b.deployment_id=s.deployment_id
        AND b.collection_address=s.collection_address AND b.token_id=s.token_id
      WHERE s.deployment_id=?`;
    const mapSale = (row: SaleRow): SaleRecord => ({
      saleId: row.saleId,
      tokenId: row.tokenId,
      seller: row.seller,
      buyer: row.buyer,
      priceWei: row.priceWei,
      fundedAt: row.fundedAt,
      expiresAt: row.expiresAt,
      status: row.status,
      tokenReclaimed: row.tokenReclaimed === 1,
      metadataStatus: row.catalogId ? 'AVAILABLE' : 'MISSING',
      catalogId: row.catalogId,
      claim:
        row.claimBeneficiary && row.claimAmountWei && row.claimKind && row.claimStatus
          ? {
              beneficiary: row.claimBeneficiary,
              amountWei: row.claimAmountWei,
              kind: row.claimKind,
              status: row.claimStatus,
            }
          : null,
    });
    const readSale = (saleId: string): SaleRecord | null => {
      const row = db.prepare(`${selectSales} AND s.sale_id=?`).get(deploymentId, saleId) as
        | SaleRow
        | undefined;
      return row ? mapSale(row) : null;
    };

    return {
      deploymentDescriptor: () => ({ ...deployment }),
      listSales: () =>
        snapshot(() =>
          (
            db
              .prepare(`${selectSales} ORDER BY length(s.sale_id),s.sale_id`)
              .all(deploymentId) as SaleRow[]
          ).map(mapSale),
        ),
      getSale: (saleId) => {
        parseUint256(saleId, 'saleId');
        return snapshot(() => readSale(saleId));
      },
      observeFunding: (saleId, selector) => {
        parseUint256(saleId, 'saleId');
        const requestedBlock = parseUint256(selector.blockNumber, 'observeBlockNumber');
        if (requestedBlock > BigInt(Number.MAX_SAFE_INTEGER))
          throw new Error('BLOCK_NUMBER_UNSAFE');
        return snapshot((): FundingObservationRecord => {
          const provenance = readProvenance(db, deploymentId);
          const freshness = readSystemRecord(
            db,
            deploymentId,
            provenance,
            hooks.now?.() ?? new Date(),
            heartbeatStaleAfterMs,
          );
          const sale = readSale(saleId);
          hooks.afterFundingBaseRead?.();
          const canonicalAtHeight = db
            .prepare(
              `SELECT block_number AS blockNumber,block_hash AS blockHash,
                      is_canonical AS isCanonical,scan_complete AS scanComplete,
                      log_scope_hash AS logScopeHash
               FROM indexed_blocks
               WHERE deployment_id=? AND block_number=? AND is_canonical=1`,
            )
            .get(deploymentId, Number(requestedBlock)) as BlockRow | undefined;
          const requestedIdentity = db
            .prepare(
              `SELECT block_number AS blockNumber,block_hash AS blockHash,
                      is_canonical AS isCanonical,scan_complete AS scanComplete,
                      log_scope_hash AS logScopeHash
               FROM indexed_blocks WHERE deployment_id=? AND block_hash=?`,
            )
            .get(deploymentId, selector.blockHash.toLowerCase()) as BlockRow | undefined;
          const checkpointReached = BigInt(provenance.indexedBlockNumber) >= requestedBlock;
          const exactCanonical =
            requestedIdentity?.blockNumber === Number(requestedBlock) &&
            requestedIdentity.isCanonical === 1 &&
            requestedIdentity.scanComplete === 1 &&
            requestedIdentity.logScopeHash === provenance.logScopeHash;
          const coverage = !checkpointReached
            ? 'NOT_REACHED'
            : exactCanonical
              ? 'SCANNED'
              : 'UNVERIFIABLE';
          const observedHeaderAtRequestedHeight = canonicalAtHeight
            ? {
                blockNumber: String(canonicalAtHeight.blockNumber),
                blockHash: canonicalAtHeight.blockHash,
                canonical: canonicalAtHeight.isCanonical === 1,
                scanComplete: canonicalAtHeight.scanComplete === 1,
              }
            : null;

          let eventLookup: FundingObservationRecord['observation']['eventLookup'] = 'NOT_FOUND';
          let matchedEvent: FundingObservationRecord['observation']['matchedEvent'] = null;
          if (
            requestedIdentity &&
            (requestedIdentity.isCanonical !== 1 ||
              canonicalAtHeight?.blockHash.toLowerCase() !== selector.blockHash.toLowerCase())
          ) {
            eventLookup = 'NONCANONICAL';
          } else if (coverage === 'SCANNED') {
            const event = db
              .prepare(
                `SELECT block_number AS blockNumber,block_hash AS blockHash,tx_hash AS transactionHash,
                        log_index AS logIndex,contract_address AS contractAddress,
                        decoded_json AS decodedJson
                 FROM chain_events
                 WHERE deployment_id=? AND block_hash=? AND log_index=?`,
              )
              .get(deploymentId, selector.blockHash.toLowerCase(), selector.logIndex) as
              | EventRow
              | undefined;
            const decoded = event ? parseSaleFunded(event.decodedJson) : null;
            if (!event) {
              eventLookup = 'NOT_FOUND';
            } else if (
              event.transactionHash.toLowerCase() !== selector.transactionHash.toLowerCase() ||
              event.blockNumber !== Number(requestedBlock) ||
              event.contractAddress.toLowerCase() !== deployment.escrowAddress.toLowerCase() ||
              !decoded ||
              decoded.saleId !== saleId
            ) {
              eventLookup = 'SELECTOR_MISMATCH';
            } else {
              eventLookup = 'MATCHED';
              matchedEvent = {
                transactionHash: event.transactionHash,
                blockNumber: String(event.blockNumber),
                blockHash: event.blockHash,
                logIndex: event.logIndex,
                emitter: event.contractAddress,
                saleId: decoded.saleId,
                buyer: decoded.buyer,
                amountWei: decoded.amountWei,
                fundedAt: decoded.fundedAt,
                expiresAt: decoded.expiresAt,
              };
            }
          }

          let projectionEffect: FundingObservationRecord['observation']['projectionEffect'] =
            'NOT_ASSESSED';
          if (matchedEvent) {
            const allowedStatus =
              sale?.status === 'FUNDED' ||
              sale?.status === 'COMPLETED' ||
              sale?.status === 'EXPIRED';
            const claimConsistent = sale?.status !== 'FUNDED' || sale.claim === null;
            projectionEffect =
              sale &&
              allowedStatus &&
              claimConsistent &&
              sale.saleId === matchedEvent.saleId &&
              sale.buyer?.toLowerCase() === matchedEvent.buyer.toLowerCase() &&
              sale.priceWei === matchedEvent.amountWei &&
              sale.fundedAt === matchedEvent.fundedAt &&
              sale.expiresAt === matchedEvent.expiresAt
                ? 'CONSISTENT'
                : 'INCONSISTENT';
          }

          return {
            sale,
            freshness,
            observation: {
              requestEcho: selector,
              coverage,
              observedHeaderAtRequestedHeight,
              eventLookup,
              matchedEvent,
              projectionEffect,
            },
          };
        });
      },
      listVehicles: () =>
        snapshot(
          () =>
            db
              .prepare(
                `SELECT c.catalog_id AS catalogId,b.token_id AS tokenId,c.name,c.description,
                        c.image_path AS imagePath,o.owner AS currentOwner,'AVAILABLE' AS metadataStatus
                 FROM catalog_vehicles c
                 LEFT JOIN catalog_asset_bindings b ON b.catalog_id=c.catalog_id AND b.deployment_id=?
                 LEFT JOIN token_ownership o ON o.deployment_id=b.deployment_id
                   AND o.collection_address=b.collection_address AND o.token_id=b.token_id
                 ORDER BY c.catalog_id`,
              )
              .all(deploymentId) as VehicleRecord[],
        ),
      systemStatus: () =>
        snapshot(() => {
          const provenance = readProvenance(db, deploymentId);
          return readSystemRecord(
            db,
            deploymentId,
            provenance,
            hooks.now?.() ?? new Date(),
            heartbeatStaleAfterMs,
          );
        }),
      recentEvents: (limit = 50) =>
        snapshot(() => {
          const rows = db
            .prepare(
              `SELECT CAST(e.block_number AS TEXT) AS blockNumber,e.block_hash AS blockHash,
                      e.tx_hash AS transactionHash,e.log_index AS logIndex,e.decoded_json AS decoded,
                      b.is_canonical AS canonical,b.scan_complete AS scanComplete,
                      b.log_scope_hash AS sourceLogScopeHash
               FROM chain_events e
               JOIN indexed_blocks b
                 ON b.deployment_id=e.deployment_id AND b.block_hash=e.block_hash
               WHERE e.deployment_id=?
               ORDER BY e.block_number DESC,e.transaction_index DESC,e.log_index DESC LIMIT ?`,
            )
            .all(deploymentId, Math.max(1, Math.min(limit, 100))) as Array<
            Omit<EventRecord, 'eventName' | 'decoded' | 'canonical' | 'scanComplete'> & {
              decoded: string;
              canonical: number;
              scanComplete: number;
            }
          >;
          return rows.map((row) => {
            const decoded = JSON.parse(row.decoded) as { kind?: string };
            return {
              ...row,
              canonical: row.canonical === 1,
              scanComplete: row.scanComplete === 1,
              eventName: decoded.kind ?? 'Unknown',
              decoded,
            };
          });
        }),
      latestReconciliation: () =>
        snapshot(() => {
          const row = db
            .prepare(
              'SELECT comparison,freshness,CAST(block_number AS TEXT) AS blockNumber,block_hash AS blockHash,projector_version AS projectorVersion,projection_build_id AS projectionBuildId,log_scope_hash AS logScopeHash,scope_json AS scope,differences_json AS differences,created_at AS createdAt FROM reconciliation_runs WHERE deployment_id=? ORDER BY created_at DESC LIMIT 1',
            )
            .get(deploymentId) as
            | (Omit<ReconciliationRecord, 'scope' | 'differences'> & {
                scope: string;
                differences: string;
              })
            | undefined;
          return row
            ? {
                ...row,
                scope: JSON.parse(row.scope) as unknown,
                differences: JSON.parse(row.differences) as unknown,
              }
            : null;
        }),
      async close() {
        db.close();
        await locks.release();
      },
    };
  } catch (error) {
    await locks.release();
    throw error;
  }
}
