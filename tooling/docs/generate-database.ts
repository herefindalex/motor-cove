import Database from 'better-sqlite3';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { format } from 'prettier';
import { databaseModel, type DatabaseTableName } from '@motorcove/database/model';

const workspace = resolve(import.meta.dirname, '../..');
const migrationsFolder = resolve(workspace, 'packages/database/drizzle');
const schemaContractPath = resolve(workspace, 'packages/database/schema-contract.json');
const schemaReferencePath = resolve(workspace, 'docs/database/schema-reference.generated.md');
const authorityPath = resolve(workspace, 'docs/database/authority-and-lifecycle.md');
const modelPath = resolve(workspace, 'docs/database/database-model.md');
const authorityStart = '<!-- GENERATED:DATABASE-AUTHORITY:START -->';
const authorityEnd = '<!-- GENERATED:DATABASE-AUTHORITY:END -->';
const modelStart = '<!-- GENERATED:DATABASE-TABLE-CONTRACTS:START -->';
const modelEnd = '<!-- GENERATED:DATABASE-TABLE-CONTRACTS:END -->';

interface ColumnRow {
  readonly cid: number;
  readonly name: string;
  readonly type: string;
  readonly notnull: 0 | 1;
  readonly dflt_value: string | null;
  readonly pk: number;
}

interface ForeignKeyRow {
  readonly id: number;
  readonly seq: number;
  readonly table: string;
  readonly from: string;
  readonly to: string;
  readonly on_update: string;
  readonly on_delete: string;
  readonly match: string;
}

interface IndexRow {
  readonly seq: number;
  readonly name: string;
  readonly unique: 0 | 1;
  readonly origin: string;
  readonly partial: 0 | 1;
}

interface IndexColumnRow {
  readonly seqno: number;
  readonly cid: number;
  readonly name: string | null;
}

export interface PhysicalIndex extends IndexRow {
  readonly columns: readonly string[];
}

export interface PhysicalTable {
  readonly name: string;
  readonly sql: string;
  readonly columns: readonly ColumnRow[];
  readonly foreignKeys: readonly ForeignKeyRow[];
  readonly indexes: readonly PhysicalIndex[];
}

export interface DatabaseDocumentationSnapshot {
  readonly contract: {
    readonly contractVersion: string;
    readonly migrationBundleDigest: string;
    readonly schemaFingerprint: string;
    readonly schemaSourceDigest: string;
    readonly requiredProjectorVersion: string;
  };
  readonly tables: readonly PhysicalTable[];
}

const escapeCell = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', ' ');
const quote = (value: string) => `\`${value.replaceAll('`', '\\`')}\``;

export function assertDatabaseModelCoverage(
  physicalTables: readonly string[],
  modeledTables: readonly string[] = Object.keys(databaseModel),
): void {
  const physical = [...physicalTables].sort();
  const modeled = [...modeledTables].sort();
  if (JSON.stringify(physical) !== JSON.stringify(modeled)) {
    const missingFromModel = physical.filter((name) => !modeled.includes(name));
    const missingFromSchema = modeled.filter((name) => !physical.includes(name));
    throw new Error(
      `DATABASE_MODEL_TABLE_DRIFT: missingFromModel=${missingFromModel.join(',') || 'none'} missingFromSchema=${missingFromSchema.join(',') || 'none'}`,
    );
  }
}

export function readDatabaseDocumentationSnapshot(): DatabaseDocumentationSnapshot {
  const db = new Database(':memory:');
  try {
    db.pragma('foreign_keys = ON');
    migrate(drizzle(db), { migrationsFolder });
    const tableRows = db
      .prepare(
        "SELECT name,sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string; sql: string }>;
    const tables = tableRows.map((table): PhysicalTable => {
      const columns = db
        .prepare(
          'SELECT cid,name,type,"notnull",dflt_value,pk FROM pragma_table_info(?) ORDER BY cid',
        )
        .all(table.name) as ColumnRow[];
      const foreignKeys = db
        .prepare(
          'SELECT id,seq,"table","from","to",on_update,on_delete,"match" FROM pragma_foreign_key_list(?) ORDER BY id,seq',
        )
        .all(table.name) as ForeignKeyRow[];
      const indexRows = db
        .prepare('SELECT seq,name,"unique",origin,partial FROM pragma_index_list(?) ORDER BY name')
        .all(table.name) as IndexRow[];
      const indexes = indexRows.map((index): PhysicalIndex => {
        const indexColumns = db
          .prepare('SELECT seqno,cid,name FROM pragma_index_info(?) ORDER BY seqno')
          .all(index.name) as IndexColumnRow[];
        return {
          ...index,
          columns: indexColumns.map((column) => column.name ?? `<expression:${column.cid}>`),
        };
      });
      return { ...table, columns, foreignKeys, indexes };
    });
    assertDatabaseModelCoverage(tables.map((table) => table.name));
    const contract = JSON.parse(
      readFileSync(schemaContractPath, 'utf8'),
    ) as DatabaseDocumentationSnapshot['contract'];
    return { contract, tables };
  } finally {
    db.close();
  }
}

function renderSchemaReference(snapshot: DatabaseDocumentationSnapshot): string {
  const lines = [
    '# Generated database schema reference',
    '',
    '> Generated by `pnpm docs:generate` from the executable Drizzle migration history. Do not edit this file by hand.',
    '',
    '## Schema contract',
    '',
    `- Contract version: \`${snapshot.contract.contractVersion}\``,
    `- Migration bundle digest: \`${snapshot.contract.migrationBundleDigest}\``,
    `- Schema fingerprint: \`${snapshot.contract.schemaFingerprint}\``,
    `- Schema source digest: \`${snapshot.contract.schemaSourceDigest}\``,
    `- Required projector version: \`${snapshot.contract.requiredProjectorVersion}\``,
    `- Repository-managed tables: ${snapshot.tables.length}`,
    '',
  ];

  for (const table of snapshot.tables) {
    lines.push(
      `## \`${table.name}\``,
      '',
      '### Columns',
      '',
      '| Name | Declared type | Required | Default | Primary-key position |',
      '| --- | --- | --- | --- | --- |',
      ...table.columns.map((column) => {
        const required = column.notnull === 1 || column.pk > 0 ? 'yes' : 'no';
        return `| ${quote(column.name)} | ${quote(column.type || 'untyped')} | ${required} | ${column.dflt_value === null ? '—' : quote(column.dflt_value)} | ${column.pk || '—'} |`;
      }),
      '',
      '### Foreign keys',
      '',
    );
    if (table.foreignKeys.length === 0) lines.push('None.');
    else {
      lines.push(
        '| From | References | On update | On delete |',
        '| --- | --- | --- | --- |',
        ...table.foreignKeys.map(
          (foreignKey) =>
            `| ${quote(foreignKey.from)} | ${quote(`${foreignKey.table}.${foreignKey.to}`)} | ${quote(foreignKey.on_update)} | ${quote(foreignKey.on_delete)} |`,
        ),
      );
    }
    lines.push('', '### Indexes', '');
    if (table.indexes.length === 0) lines.push('None.');
    else {
      lines.push(
        '| Name | Columns | Unique | Partial | Origin |',
        '| --- | --- | --- | --- | --- |',
        ...table.indexes.map(
          (index) =>
            `| ${quote(index.name)} | ${index.columns.map(quote).join(', ')} | ${index.unique ? 'yes' : 'no'} | ${index.partial ? 'yes' : 'no'} | ${quote(index.origin)} |`,
        ),
      );
    }
    lines.push('', '### Executed table definition', '', '```sql', table.sql.trim(), '```', '');
  }
  return `${lines.join('\n').trim()}\n`;
}

function renderAuthorityMatrix(): string {
  return [
    '| Table | Category | Authority | Writers | Derived | Rebuildable | Recovery source | Backup | Reorg semantics |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...Object.entries(databaseModel).map(([name, model]) =>
      [
        quote(name),
        quote(model.category),
        escapeCell(model.authority),
        model.writers.map(escapeCell).join('<br>'),
        model.derived ? 'yes' : 'no',
        model.rebuildable ? 'yes' : 'no',
        escapeCell(model.recoverySource),
        quote(model.backupRequirement),
        escapeCell(model.reorgSemantics),
      ]
        .join(' | ')
        .replace(/^/, '| ')
        .replace(/$/, ' |'),
    ),
  ].join('\n');
}

function renderTableContracts(): string {
  return Object.entries(databaseModel)
    .map(([name, model]) => {
      const rows = [
        ['Purpose', model.purpose],
        ['Category', model.category],
        ['Authority', model.authority],
        ['Identity', model.identity],
        ['Writers', model.writers.join('; ')],
        ['Readers', model.readers.join('; ')],
        ['Derived', model.derived ? 'yes' : 'no'],
        ['Rebuildable', model.rebuildable ? 'yes' : 'no'],
        ['Recovery source', model.recoverySource],
        ['Backup requirement', model.backupRequirement],
        ['Restore requirement', model.restoreRequirement],
        ['Reorg semantics', model.reorgSemantics],
        ['Lifecycle', model.lifecycle],
      ];
      const temporal = model.temporalSemantics.length
        ? [
            '| Field | Time class | Meaning |',
            '| --- | --- | --- |',
            ...model.temporalSemantics.map(
              (entry) =>
                `| ${quote(entry.field)} | ${quote(entry.category)} | ${escapeCell(entry.meaning)} |`,
            ),
          ]
        : ['No physical timestamp or block-time field is recorded in this table.'];
      return [
        `### ${quote(name)}`,
        '',
        '| Property | Contract |',
        '| --- | --- |',
        ...rows.map(([label, value]) => `| ${label} | ${escapeCell(value)} |`),
        '',
        '#### Temporal semantics',
        '',
        ...temporal,
        '',
        model.temporalNote,
      ].join('\n');
    })
    .join('\n\n');
}

function replaceGeneratedRegion(
  current: string,
  body: string,
  markers: { start: string; end: string; path: string },
): string {
  const start = current.indexOf(markers.start);
  const end = current.indexOf(markers.end);
  if (start < 0 || end < start) throw new Error(`GENERATED_MARKER_MISSING: ${markers.path}`);
  return `${current.slice(0, start + markers.start.length)}\n${body}\n${current.slice(end)}`;
}

async function writeOrCheck(path: string, next: string, check: boolean): Promise<void> {
  let current: string | null = null;
  try {
    current = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const formatted = await format(next, { filepath: path });
  if (check && current !== formatted) throw new Error(`GENERATED_DOC_DRIFT: ${path}`);
  if (!check && current !== formatted) writeFileSync(path, formatted);
}

export async function generateDatabaseDocumentation(
  check = false,
): Promise<{ readonly tables: number }> {
  const snapshot = readDatabaseDocumentationSnapshot();
  for (const table of snapshot.tables) {
    const model = databaseModel[table.name as DatabaseTableName];
    const classified = new Set(model.temporalSemantics.map((temporal) => temporal.field));
    for (const temporal of model.temporalSemantics) {
      if (!table.columns.some((column) => column.name === temporal.field)) {
        throw new Error(`DATABASE_MODEL_TEMPORAL_FIELD_DRIFT: ${table.name}.${temporal.field}`);
      }
    }
    for (const column of table.columns) {
      if (/(?:_at|_timestamp)$/.test(column.name) && !classified.has(column.name)) {
        throw new Error(`DATABASE_MODEL_TEMPORAL_FIELD_UNCLASSIFIED: ${table.name}.${column.name}`);
      }
    }
  }
  await writeOrCheck(schemaReferencePath, renderSchemaReference(snapshot), check);
  const authorityCurrent = readFileSync(authorityPath, 'utf8');
  await writeOrCheck(
    authorityPath,
    replaceGeneratedRegion(authorityCurrent, renderAuthorityMatrix(), {
      start: authorityStart,
      end: authorityEnd,
      path: authorityPath,
    }),
    check,
  );
  const modelCurrent = readFileSync(modelPath, 'utf8');
  await writeOrCheck(
    modelPath,
    replaceGeneratedRegion(modelCurrent, renderTableContracts(), {
      start: modelStart,
      end: modelEnd,
      path: modelPath,
    }),
    check,
  );
  return { tables: snapshot.tables.length };
}

export const databaseDocumentationTableNames = Object.keys(databaseModel) as DatabaseTableName[];
