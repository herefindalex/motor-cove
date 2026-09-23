import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { databaseModel } from '@motorcove/database/model';
import {
  assertDatabaseModelCoverage,
  generateDatabaseDocumentation,
  readDatabaseDocumentationSnapshot,
} from './generate-database.js';

const workspace = resolve(import.meta.dirname, '../..');

describe('database documentation contract', () => {
  it('covers every physical table with the semantic database model', () => {
    const snapshot = readDatabaseDocumentationSnapshot();
    expect(snapshot.tables.map((table) => table.name).sort()).toEqual(
      Object.keys(databaseModel).sort(),
    );
    expect(snapshot.tables).toHaveLength(13);
  });

  it('extracts representative migration-defined columns, keys, and indexes', () => {
    const snapshot = readDatabaseDocumentationSnapshot();
    const chainEvents = snapshot.tables.find((table) => table.name === 'chain_events');
    const bindings = snapshot.tables.find((table) => table.name === 'catalog_asset_bindings');
    const indexedBlocks = snapshot.tables.find((table) => table.name === 'indexed_blocks');

    expect(chainEvents?.columns.map((column) => column.name)).toContain('source_record_digest');
    expect(
      bindings?.columns.filter((column) => column.pk > 0).map((column) => column.name),
    ).toEqual(['deployment_id', 'collection_address', 'token_id']);
    expect(bindings?.foreignKeys.map((foreignKey) => foreignKey.table).sort()).toEqual([
      'catalog_vehicles',
      'deployments',
    ]);
    expect(indexedBlocks?.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'indexed_blocks_canonical_number',
          unique: 1,
          partial: 1,
          columns: ['deployment_id', 'block_number'],
        }),
      ]),
    );
  });

  it('fails closed when physical and semantic table sets diverge', () => {
    expect(() => assertDatabaseModelCoverage(['deployments'], [])).toThrow(
      'DATABASE_MODEL_TABLE_DRIFT: missingFromModel=deployments missingFromSchema=none',
    );
    expect(() => assertDatabaseModelCoverage([], ['deployments'])).toThrow(
      'DATABASE_MODEL_TABLE_DRIFT: missingFromModel=none missingFromSchema=deployments',
    );
  });

  it('keeps generated database documentation byte-for-byte current', async () => {
    await expect(generateDatabaseDocumentation(true)).resolves.toEqual({ tables: 13 });
    const reference = readFileSync(
      resolve(workspace, 'docs/database/schema-reference.generated.md'),
      'utf8',
    );
    expect(reference).toContain('## `__drizzle_migrations`');
    expect(reference).toContain('## `reconciliation_runs`');
  });
});
