export const databaseCategories = [
  'SCHEMA_CONTROL',
  'DEPLOYMENT_IDENTITY',
  'OFFCHAIN_AUTHORITY',
  'RAW_CHAIN_EVIDENCE',
  'DERIVED_PROJECTION',
  'RUNTIME_OBSERVATION',
  'AUDIT_EVIDENCE',
] as const;

export type DatabaseCategory = (typeof databaseCategories)[number];
export type BackupRequirement = 'CRITICAL' | 'PREFER' | 'CONVENIENCE' | 'NONE';

export interface DatabaseTableModel {
  readonly purpose: string;
  readonly category: DatabaseCategory;
  readonly authority: string;
  readonly writers: readonly string[];
  readonly readers: readonly string[];
  readonly derived: boolean;
  readonly rebuildable: boolean;
  readonly recoverySource: string;
  readonly backupRequirement: BackupRequirement;
  readonly reorgSemantics: string;
  readonly lifecycle: string;
}

/**
 * Architectural meaning of every repository-managed SQLite table.
 *
 * SQL columns and constraints remain migration-derived. This model records the semantic facts that
 * SQLite cannot express and is checked against the migrated physical table set by docs:generate.
 */
export const databaseModel = {
  __drizzle_migrations: {
    purpose: 'Native migration ledger for the exact SQL history applied to this database.',
    category: 'SCHEMA_CONTROL',
    authority: 'Repository Drizzle migration bundle',
    writers: ['Drizzle migration runner'],
    readers: ['Migration verifier', 'Maintenance commands'],
    derived: false,
    rebuildable: false,
    recoverySource: 'Verified database backup or migration replay into a new empty database',
    backupRequirement: 'CRITICAL',
    reorgSemantics: 'Not chain-dependent.',
    lifecycle: 'Created and appended only by ordered migrations; existing rows are immutable.',
  },
  db_contract: {
    purpose: 'Attestation that the database matches one repository schema contract.',
    category: 'SCHEMA_CONTROL',
    authority: 'Verified schema contract, migration bundle, and schema fingerprint',
    writers: ['Migration maintenance operation'],
    readers: ['Database verifier', 'Backup and restore tooling'],
    derived: true,
    rebuildable: true,
    recoverySource: 'Successful verification against the repository schema contract',
    backupRequirement: 'CONVENIENCE',
    reorgSemantics: 'Not chain-dependent.',
    lifecycle: 'Updated only after the complete migration and schema verification transaction.',
  },
  deployments: {
    purpose:
      'Immutable descriptor for the chain and contract generation represented by the database.',
    category: 'DEPLOYMENT_IDENTITY',
    authority: 'Verified deployment manifest and on-chain contract identity',
    writers: ['Bootstrap deployment registration'],
    readers: ['API startup', 'Indexer', 'Backup and restore', 'Reconciliation'],
    derived: false,
    rebuildable: false,
    recoverySource: 'Compatible deployment manifest plus verified on-chain identity',
    backupRequirement: 'CRITICAL',
    reorgSemantics:
      'Deployment block hashes are identity evidence and must not be silently replaced.',
    lifecycle:
      'Inserted once for a managed deployment generation; replacement requires a new environment generation.',
  },
  catalog_vehicles: {
    purpose: 'MotorCove product metadata that has no complete on-chain representation.',
    category: 'OFFCHAIN_AUTHORITY',
    authority: 'MotorCove catalog seed or explicit local catalog input',
    writers: ['Catalog seed maintenance command'],
    readers: ['API', 'Catalog binding maintenance', 'Projection rebuild preservation'],
    derived: false,
    rebuildable: false,
    recoverySource: 'Verified database backup or the exact authoritative catalog input',
    backupRequirement: 'CRITICAL',
    reorgSemantics: 'Catalog rows are independent of chain canonicality.',
    lifecycle: 'Seeded idempotently and updated only under exclusive maintenance ownership.',
  },
  catalog_asset_bindings: {
    purpose: 'Binds local catalog identity to a token in one deployment and collection.',
    category: 'OFFCHAIN_AUTHORITY',
    authority: 'MotorCove catalog authority constrained by deployment identity',
    writers: ['Catalog seed maintenance command'],
    readers: ['API', 'Catalog and token projection queries'],
    derived: false,
    rebuildable: false,
    recoverySource: 'Verified database backup or the exact authoritative binding input',
    backupRequirement: 'CRITICAL',
    reorgSemantics: 'Bindings remain deployment-scoped; a reorg does not rewrite catalog intent.',
    lifecycle: 'Created idempotently after both deployment and catalog rows exist.',
  },
  indexed_blocks: {
    purpose: 'Block identity, canonicality, scan completeness, and observed-log digest evidence.',
    category: 'RAW_CHAIN_EVIDENCE',
    authority: 'Verified chain observation for the configured deployment and log scope',
    writers: ['Indexer ingestion', 'Reindex maintenance'],
    readers: ['Indexer', 'Projection rebuild', 'Reconciliation', 'Diagnostics'],
    derived: false,
    rebuildable: true,
    recoverySource: 'Explicit reindex from the verified deployment scan start',
    backupRequirement: 'PREFER',
    reorgSemantics:
      'Competing hashes may be retained; exactly one canonical row may exist per deployment and height.',
    lifecycle:
      'Inserted during ingestion, canonicality changes atomically with event and projection updates.',
  },
  chain_events: {
    purpose: 'Raw and decoded contract-log evidence retained before projection interpretation.',
    category: 'RAW_CHAIN_EVIDENCE',
    authority: 'Verified chain log observation and recorded decoder version',
    writers: ['Indexer ingestion', 'Reindex maintenance'],
    readers: ['Projection rebuild', 'Reconciliation', 'Diagnostics'],
    derived: false,
    rebuildable: true,
    recoverySource: 'Explicit reindex from canonical block headers and logs',
    backupRequirement: 'PREFER',
    reorgSemantics:
      'Historical noncanonical events remain auditable and are interpreted through indexed_blocks canonicality.',
    lifecycle:
      'Inserted with source digests in the same unit of work as block and checkpoint evidence.',
  },
  indexer_checkpoint: {
    purpose: 'Committed cursor and projection-generation identity for incremental ingestion.',
    category: 'RUNTIME_OBSERVATION',
    authority: 'Last atomically committed canonical ingestion unit',
    writers: ['Indexer ingestion', 'Projection rebuild', 'Reindex maintenance'],
    readers: ['Indexer', 'API provenance', 'Maintenance and reconciliation'],
    derived: true,
    rebuildable: true,
    recoverySource: 'Verified indexed_blocks and chain_events, or explicit reindex',
    backupRequirement: 'CONVENIENCE',
    reorgSemantics: 'Checkpoint block and hash must remain an inseparable canonical anchor.',
    lifecycle:
      'Advances only in the atomic event/projection commit and may rewind only under explicit recovery.',
  },
  sales: {
    purpose: 'Query-efficient projection of escrow sale state.',
    category: 'DERIVED_PROJECTION',
    authority: 'Verified canonical MotorCoveEscrow events',
    writers: ['Indexer projector', 'Projection rebuild', 'Reindex maintenance'],
    readers: ['API', 'Reconciliation'],
    derived: true,
    rebuildable: true,
    recoverySource:
      'Verified canonical chain_events; explicit reindex when source evidence is suspect',
    backupRequirement: 'CONVENIENCE',
    reorgSemantics:
      'Rows follow the canonical event sequence and roll back atomically with checkpoint changes.',
    lifecycle: 'Created by SaleCreated and advanced only by valid sale-state transitions.',
  },
  payment_claims: {
    purpose: 'Projection of pull-payment claims and withdrawal state.',
    category: 'DERIVED_PROJECTION',
    authority: 'Verified canonical escrow claim events',
    writers: ['Indexer projector', 'Projection rebuild', 'Reindex maintenance'],
    readers: ['API', 'Reconciliation'],
    derived: true,
    rebuildable: true,
    recoverySource:
      'Verified canonical chain_events; explicit reindex when source evidence is suspect',
    backupRequirement: 'CONVENIENCE',
    reorgSemantics: 'Claim state follows canonical creation and withdrawal events.',
    lifecycle:
      'Created with a claim event and marked withdrawn only by its matching canonical event.',
  },
  token_ownership: {
    purpose: 'Current ERC-721 ownership projection independent of historical sale buyer identity.',
    category: 'DERIVED_PROJECTION',
    authority: 'Verified canonical VehicleNFT Transfer events',
    writers: ['Indexer projector', 'Projection rebuild', 'Reindex maintenance'],
    readers: ['API', 'Reconciliation'],
    derived: true,
    rebuildable: true,
    recoverySource: 'Verified canonical VehicleNFT chain_events or explicit reindex',
    backupRequirement: 'CONVENIENCE',
    reorgSemantics: 'Ownership follows the canonical transfer sequence at the checkpoint.',
    lifecycle:
      'Upserted for every canonical mint or transfer; never inferred from sale history alone.',
  },
  indexer_runtime_status: {
    purpose:
      'Last-known projection health, chain observation, recovery reason, and worker heartbeat.',
    category: 'RUNTIME_OBSERVATION',
    authority: 'Indexer runtime and live RPC observation',
    writers: ['Indexer runtime', 'Explicit projection maintenance'],
    readers: ['API system status', 'Web freshness presentation', 'Maintenance diagnostics'],
    derived: true,
    rebuildable: true,
    recoverySource: 'Fresh Indexer execution and explicit recovery transitions',
    backupRequirement: 'NONE',
    reorgSemantics:
      'A detected conflict moves health toward recovery; maintenance must not invent live freshness.',
    lifecycle:
      'Updated by observation, commit, failure, and recovery transitions without replacing historical chain evidence.',
  },
  reconciliation_runs: {
    purpose: 'Historical report of a projection-to-chain comparison at explicit anchors.',
    category: 'AUDIT_EVIDENCE',
    authority: 'Reconciliation observation at its recorded deployment, scope, checkpoint, and head',
    writers: ['Reconciliation CLI'],
    readers: ['API diagnostics', 'Operators'],
    derived: true,
    rebuildable: false,
    recoverySource: 'Verified database backup; a new run cannot recreate the prior observation',
    backupRequirement: 'PREFER',
    reorgSemantics:
      'A report remains tied to its historical anchors and never inherits current canonicality.',
    lifecycle: 'Append-only report publication after the comparison result is fully determined.',
  },
} as const satisfies Record<string, DatabaseTableModel>;

export type DatabaseTableName = keyof typeof databaseModel;
