import Database from 'better-sqlite3';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { seedCatalog, type CatalogSeedSet } from '@motorcove/database/maintenance';
import { databaseFixture, hashes } from '../helpers/database.js';
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const seed = (deploymentId = hashes.deployment): CatalogSeedSet => ({
  id: 'catalog-test',
  version: '1',
  vehicles: [
    {
      catalogId: 'apex',
      name: 'Apex',
      description: 'Test vehicle',
      model: 'GT',
      modelYear: '2026',
      imagePath: '/apex.svg',
    },
  ],
  bindings: [{ deploymentId, collectionAddress: hashes.address, tokenId: '1', catalogId: 'apex' }],
});
describe('catalog seed semantics', () => {
  it('DB-23 reruns the same version as a no-op', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    expect((await seedCatalog(paths, seed())).changed).toBe(true);
    expect((await seedCatalog(paths, seed())).changed).toBe(false);
    const db = new Database(paths.databasePath);
    expect(
      (db.prepare('SELECT count(*) count FROM catalog_vehicles').get() as { count: number }).count,
    ).toBe(1);
    db.close();
  });

  it('preserves catalog creation and mutation times on a no-op seed rerun', async () => {
    const { root, paths } = await databaseFixture('seed-temporal-noop');
    roots.push(root);
    await seedCatalog(paths, seed());
    const originalCreated = '2020-01-01T00:00:00.000Z';
    const originalUpdated = '2021-01-01T00:00:00.000Z';
    const db = new Database(paths.databasePath);
    db.prepare('UPDATE catalog_vehicles SET created_at=?,updated_at=? WHERE catalog_id=?').run(
      originalCreated,
      originalUpdated,
      'apex',
    );
    db.close();

    expect((await seedCatalog(paths, seed())).changed).toBe(false);
    const reopened = new Database(paths.databasePath);
    expect(
      reopened
        .prepare(
          'SELECT created_at AS createdAt,updated_at AS updatedAt FROM catalog_vehicles WHERE catalog_id=?',
        )
        .get('apex'),
    ).toEqual({ createdAt: originalCreated, updatedAt: originalUpdated });
    reopened.close();
  });

  it('rejects catalog writes while an incomplete maintenance marker exists', async () => {
    const { root, paths } = await databaseFixture('seed-maintenance-incomplete');
    roots.push(root);
    const marker = `${JSON.stringify(
      {
        operationId: 'failed-reindex',
        operationType: 'REINDEX_PROJECTION',
        stage: 'FAILED',
        environmentId: 'seed-maintenance-incomplete',
        targetDatabase: paths.databasePath,
        expectedSchemaContract: 'test-contract',
        expectedDeploymentId: hashes.deployment,
        startedAt: '2026-09-22T00:00:00.000Z',
        lastError: 'controlled failure',
      },
      null,
      2,
    )}\n`;
    writeFileSync(paths.maintenancePath, marker);

    await expect(seedCatalog(paths, seed())).rejects.toThrow('MAINTENANCE_INCOMPLETE');

    const db = new Database(paths.databasePath, { readonly: true });
    expect(db.prepare('SELECT count(*) AS count FROM catalog_vehicles').get()).toEqual({
      count: 0,
    });
    expect(db.prepare('SELECT count(*) AS count FROM catalog_asset_bindings').get()).toEqual({
      count: 0,
    });
    db.close();
    expect(readFileSync(paths.maintenancePath, 'utf8')).toBe(marker);
  });
  it('DB-24 preserves manual changes and reports SEED_CONFLICT atomically', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    await seedCatalog(paths, seed());
    const db = new Database(paths.databasePath);
    db.prepare(`UPDATE catalog_vehicles SET name='Manual edit' WHERE catalog_id='apex'`).run();
    db.close();
    await expect(seedCatalog(paths, seed())).rejects.toThrow('SEED_CONFLICT');
    const after = new Database(paths.databasePath);
    expect(
      after.prepare(`SELECT name FROM catalog_vehicles WHERE catalog_id='apex'`).get(),
    ).toEqual({ name: 'Manual edit' });
    after.close();
  });
  it('DB-25 isolates the same token binding across deployments', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    await seedCatalog(paths, seed());
    const second = `0x${'a'.repeat(64)}`;
    const db = new Database(paths.databasePath);
    db.prepare(
      `INSERT INTO deployments SELECT ?,chain_id,nft_address,escrow_address,protocol_version,abi_bundle_hash,scan_start_block,nft_deployment_block,nft_deployment_hash,nft_runtime_code_hash,escrow_deployment_block,escrow_deployment_hash,escrow_runtime_code_hash,manifest_hash,manifest_json,registered_at FROM deployments WHERE deployment_id=?`,
    ).run(second, hashes.deployment);
    db.close();
    await seedCatalog(paths, { ...seed(second), vehicles: seed().vehicles });
    const after = new Database(paths.databasePath);
    expect(
      (
        after
          .prepare(`SELECT count(*) count FROM catalog_asset_bindings WHERE token_id='1'`)
          .get() as { count: number }
      ).count,
    ).toBe(2);
    after.close();
  });

  it('DB-29 rejects a changed seed version instead of overwriting the applied dataset', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    await seedCatalog(paths, seed());
    await expect(seedCatalog(paths, { ...seed(), version: '2' })).rejects.toThrow('SEED_CONFLICT');
    const db = new Database(paths.databasePath);
    expect(
      db
        .prepare("SELECT seed_set_version AS version FROM catalog_vehicles WHERE catalog_id='apex'")
        .get(),
    ).toEqual({ version: '1' });
    db.close();
  });
});
