import Database from 'better-sqlite3';
import { spawn } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createReadOnlyReader } from '@motorcove/database/reader';
import { openProjectionWriter } from '@motorcove/database/projection-writer';
import { acquireMaintenanceLocks } from '@motorcove/database/maintenance';
import { canonicalUint256, parseUint256, uint256Max } from '@motorcove/database/types';
import { databaseFixture, hashes } from '../helpers/database.js';
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('database boundaries', () => {
  it('DB-10/11 round-trips uint256 without Number conversion and rejects invalid forms', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const db = new Database(paths.databasePath);
    const huge = '9007199254740993';
    db.prepare(
      `INSERT INTO sales(deployment_id,sale_id,collection_address,token_id,seller,price_wei,status,created_block,updated_block,last_event_block_hash,last_event_log_index,token_reclaimed) VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`,
    ).run(
      hashes.deployment,
      huge,
      hashes.address,
      huge,
      hashes.address,
      uint256Max.toString(),
      'LISTED',
      1,
      1,
      hashes.block,
      0,
    );
    db.close();
    const reader = await createReadOnlyReader(paths, hashes.deployment);
    expect(reader.deploymentDescriptor()).toMatchObject({
      deploymentId: hashes.deployment,
      chainId: '31337',
      nftAddress: hashes.address,
      escrowAddress: hashes.escrow,
      protocolVersion: '0.1.0',
      manifestHash: hashes.manifest,
    });
    expect(reader.getSale(huge).data.priceWei).toBe(uint256Max.toString());
    await reader.close();
    expect(canonicalUint256(uint256Max)).toBe(uint256Max.toString());
    for (const invalid of ['-1', '01', '1.0', '1e2', (uint256Max + 1n).toString()])
      expect(() => parseUint256(invalid)).toThrow();
  });
  it('DB-12 scopes identical sale IDs by deployment', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const db = new Database(paths.databasePath);
    const d2 = `0x${'a'.repeat(64)}`;
    db.prepare(
      `INSERT INTO deployments SELECT ?,chain_id,nft_address,escrow_address,protocol_version,abi_bundle_hash,scan_start_block,nft_deployment_block,nft_deployment_hash,nft_runtime_code_hash,escrow_deployment_block,escrow_deployment_hash,escrow_runtime_code_hash,manifest_hash,manifest_json,registered_at FROM deployments WHERE deployment_id=?`,
    ).run(d2, hashes.deployment);
    const insert = db.prepare(
      `INSERT INTO sales(deployment_id,sale_id,collection_address,token_id,seller,price_wei,status,created_block,updated_block,last_event_block_hash,last_event_log_index,token_reclaimed) VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`,
    );
    insert.run(
      hashes.deployment,
      '1',
      hashes.address,
      '1',
      hashes.address,
      '1',
      'LISTED',
      1,
      1,
      hashes.block,
      0,
    );
    insert.run(d2, '1', hashes.address, '2', hashes.address, '2', 'LISTED', 1, 1, hashes.block, 0);
    expect(
      (db.prepare(`SELECT count(*) count FROM sales WHERE sale_id='1'`).get() as { count: number })
        .count,
    ).toBe(2);
    db.close();
  });
  it('DB-13 rejects invalid status, foreign key, and duplicate identity through raw SQL', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const db = new Database(paths.databasePath);
    db.pragma('foreign_keys = ON');
    const sql = `INSERT INTO sales(deployment_id,sale_id,collection_address,token_id,seller,price_wei,status,created_block,updated_block,last_event_block_hash,last_event_log_index,token_reclaimed) VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`;
    expect(() =>
      db
        .prepare(sql)
        .run(
          hashes.deployment,
          '1',
          hashes.address,
          '1',
          hashes.address,
          '1',
          'INVALID',
          1,
          1,
          hashes.block,
          0,
        ),
    ).toThrow();
    expect(() =>
      db
        .prepare(sql)
        .run(
          `0x${'f'.repeat(64)}`,
          '1',
          hashes.address,
          '1',
          hashes.address,
          '1',
          'LISTED',
          1,
          1,
          hashes.block,
          0,
        ),
    ).toThrow();
    db.prepare(sql).run(
      hashes.deployment,
      '1',
      hashes.address,
      '1',
      hashes.address,
      '1',
      'LISTED',
      1,
      1,
      hashes.block,
      0,
    );
    expect(() =>
      db
        .prepare(sql)
        .run(
          hashes.deployment,
          '1',
          hashes.address,
          '1',
          hashes.address,
          '1',
          'LISTED',
          1,
          1,
          hashes.block,
          0,
        ),
    ).toThrow();
    db.close();
  });
  it('DB-14 reader surface has no write primitive and readonly SQLite rejects writes', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const reader = await createReadOnlyReader(paths, hashes.deployment);
    expect('database' in reader).toBe(false);
    const readonly = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
    expect(() => readonly.exec('CREATE TABLE forbidden(id INTEGER)')).toThrow();
    readonly.close();
    await reader.close();
  });
  it('DB-16 rejects unsafe block ranges at the SQL boundary', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const db = new Database(paths.databasePath);
    expect(() =>
      db
        .prepare('UPDATE indexer_checkpoint SET last_scanned_block=?')
        .run(Number.MAX_SAFE_INTEGER + 1),
    ).toThrow();
    db.close();
  });
  it('DB-17 prevents a second indexer writer', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const first = await openProjectionWriter(paths);
    await expect(openProjectionWriter(paths)).rejects.toThrow('RESOURCE_BUSY');
    await first.close();
  });
  it('DB-18/19 blocks maintenance while runtime is active and runtime while maintenance is active', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const reader = await createReadOnlyReader(paths, hashes.deployment);
    await expect(acquireMaintenanceLocks(paths)).rejects.toThrow('RESOURCE_BUSY');
    await reader.close();
    const maintenance = await acquireMaintenanceLocks(paths);
    await expect(createReadOnlyReader(paths, hashes.deployment)).rejects.toThrow('RESOURCE_BUSY');
    await maintenance.release();
  });
  it('DB-21 marker blocks runtime after maintenance lock is released', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    writeFileSync(paths.maintenancePath, '{}');
    await expect(createReadOnlyReader(paths, hashes.deployment)).rejects.toThrow(
      'MAINTENANCE_INCOMPLETE',
    );
  });

  it('DB-08 rejects a behind schema through the real runtime reader startup', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const db = new Database(paths.databasePath);
    db.prepare('DELETE FROM __drizzle_migrations').run();
    db.close();
    await expect(createReadOnlyReader(paths, hashes.deployment)).rejects.toThrow(
      'DB_HISTORY_DIVERGED',
    );
  });

  it('DB-15 keeps projection rows readable when catalog metadata is missing', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const db = new Database(paths.databasePath);
    db.prepare(
      `INSERT INTO sales(
        deployment_id,sale_id,collection_address,token_id,seller,price_wei,status,
        created_block,updated_block,last_event_block_hash,last_event_log_index,token_reclaimed
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`,
    ).run(
      hashes.deployment,
      '1',
      hashes.address,
      '1',
      hashes.address,
      '1',
      'LISTED',
      1,
      1,
      hashes.block,
      0,
    );
    db.close();
    const reader = await createReadOnlyReader(paths, hashes.deployment);
    expect(reader.getSale('1').data).toMatchObject({
      saleId: '1',
      metadataStatus: 'MISSING',
      catalogId: null,
    });
    await reader.close();
  });

  it('DB-20 releases runtime and writer locks after the owning process is killed', async () => {
    const { root, paths } = await databaseFixture('lock-kill');
    roots.push(root);
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', resolve('tests/fixtures/database-lock-child.ts'), root, 'lock-kill'],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
    );
    await new Promise<void>((resolveReady, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('lock child readiness timeout')), 5_000);
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        if (output.includes('READY')) {
          clearTimeout(timeout);
          resolveReady();
        }
      });
      child.once('error', reject);
      child.once('exit', (code, signal) =>
        reject(new Error(`lock child exited before readiness: ${String(code)}/${String(signal)}`)),
      );
    });
    await expect(openProjectionWriter(paths)).rejects.toThrow('RESOURCE_BUSY');
    if (!child.pid) throw new Error('lock child PID missing');
    process.kill(child.pid, 'SIGKILL');
    await new Promise<void>((resolveExit) => child.once('exit', () => resolveExit()));
    let recovered: Awaited<ReturnType<typeof openProjectionWriter>> | undefined;
    for (let attempt = 0; attempt < 50 && !recovered; attempt += 1) {
      try {
        recovered = await openProjectionWriter(paths);
      } catch {
        await new Promise((resolveWait) => setTimeout(resolveWait, 20));
      }
    }
    expect(recovered).toBeDefined();
    await recovered?.close();
  });

  it('DB-22 surfaces SQLITE_BUSY and preserves the blocked value', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const blocker = new Database(paths.databasePath);
    blocker.exec('BEGIN IMMEDIATE');
    const writer = new Database(paths.databasePath);
    writer.pragma('busy_timeout = 50');
    expect(() =>
      writer
        .prepare(
          "UPDATE indexer_runtime_status SET projection_status='SYNCING' WHERE deployment_id=?",
        )
        .run(hashes.deployment),
    ).toThrow(/busy|locked/i);
    blocker.exec('ROLLBACK');
    expect(
      (
        writer
          .prepare(
            'SELECT projection_status AS value FROM indexer_runtime_status WHERE deployment_id=?',
          )
          .get(hashes.deployment) as { value: string }
      ).value,
    ).toBe('CURRENT');
    writer.close();
    blocker.close();
  });

  it('DB-22 rolls back the whole transaction on a bounded SQLITE_FULL fixture', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const db = new Database(paths.databasePath);
    db.pragma('wal_checkpoint(TRUNCATE)');
    const pageCount = db.pragma('page_count', { simple: true }) as number;
    db.pragma(`max_page_count = ${pageCount}`);
    expect(() =>
      db.transaction(() => {
        db.prepare(
          "UPDATE indexer_runtime_status SET projection_status='SYNCING' WHERE deployment_id=?",
        ).run(hashes.deployment);
        db.prepare(
          `INSERT INTO catalog_vehicles(
            catalog_id,name,description,model,model_year,image_path,origin,
            seed_set_id,seed_set_version,created_at,updated_at
          ) VALUES ('full','Full',?,'M','2026','/full.svg','MANUAL',NULL,NULL,'x','x')`,
        ).run('x'.repeat(1_000_000));
      })(),
    ).toThrow(/full/i);
    expect(
      (
        db
          .prepare(
            'SELECT projection_status AS value FROM indexer_runtime_status WHERE deployment_id=?',
          )
          .get(hashes.deployment) as { value: string }
      ).value,
    ).toBe('CURRENT');
    expect(
      (
        db
          .prepare("SELECT count(*) AS value FROM catalog_vehicles WHERE catalog_id='full'")
          .get() as {
          value: number;
        }
      ).value,
    ).toBe(0);
    db.close();
  });
});
