import Database from 'better-sqlite3';
import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keccak256, type PublicClient } from 'viem';
import type { DeploymentManifest } from '@motorcove/chain-artifacts/manifest';
import { chainProfileForId } from '@motorcove/chain-artifacts/profiles';
import { createReadOnlyReader } from '@motorcove/database/reader';
import { runSourceAudit } from '../../apps/indexer/src/adapters/evm/run-source-audit.js';
import { evidenceDigest } from '../../apps/indexer/src/domain/source-evidence.js';
import { logScopeHash } from '../../apps/indexer/src/runtime/config.js';
import { databaseFixture, hashes } from '../helpers/database.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('source audit read-only SQLite snapshot', () => {
  it('compares real SQLite source evidence with a separately configured read-only provider', async () => {
    const { root, paths } = await databaseFixture('source-audit-comparison');
    roots.push(root);
    const code = '0x6000' as const;
    const manifest = {
      chainId: '31337',
      deploymentId: hashes.deployment,
      nft: { address: hashes.address, runtimeCodeHash: keccak256(code) },
      escrow: { address: hashes.escrow, runtimeCodeHash: keccak256(code) },
    } as DeploymentManifest;
    const scope = logScopeHash(manifest);
    const db = new Database(paths.databasePath);
    db.prepare(`UPDATE indexer_checkpoint SET log_scope_hash = ? WHERE deployment_id = ?`).run(
      scope,
      hashes.deployment,
    );
    db.prepare(
      `INSERT INTO indexed_blocks(
        deployment_id, block_hash, block_number, parent_hash, block_timestamp,
        is_canonical, scan_complete, log_scope_hash, observed_log_count, observed_log_digest
       ) VALUES (?, ?, 1, ?, 1, 1, 1, ?, 0, ?)`,
    ).run(hashes.deployment, hashes.block, hashes.parent, scope, evidenceDigest([]));
    db.close();

    const secondary = {
      getChainId: vi.fn(async () => 31337),
      readContract: vi.fn(async () => manifest.deploymentId),
      getCode: vi.fn(async () => code),
      getBlock: vi.fn(async () => ({ number: 1n, hash: hashes.block, parentHash: hashes.parent })),
      getLogs: vi.fn(async () => []),
    } as unknown as PublicClient;
    const reader = await createReadOnlyReader(paths, hashes.deployment);
    try {
      const options = {
        reader,
        secondary,
        manifest,
        profile: chainProfileForId(31337),
        primaryRpcUrl: 'http://127.0.0.1:8545/primary',
        secondaryRpcUrl: 'http://127.0.0.1:8546/secondary',
        fromBlock: 1n,
        toBlock: 1n,
      };
      expect((await runSourceAudit(options)).result).toBe('MATCH');

      vi.mocked(secondary.getBlock).mockResolvedValue({
        number: 1n,
        hash: `0x${'a'.repeat(64)}`,
        parentHash: hashes.parent,
      } as Awaited<ReturnType<PublicClient['getBlock']>>);
      expect(await runSourceAudit(options)).toMatchObject({
        result: 'MISMATCH',
        mismatches: [{ blockNumber: '1', reason: 'BLOCK_HASH_MISMATCH' }],
      });

      vi.mocked(secondary.getBlock).mockResolvedValueOnce({
        number: 1n,
        hash: hashes.block,
        parentHash: hashes.parent,
      } as Awaited<ReturnType<PublicClient['getBlock']>>);
      expect(await runSourceAudit(options)).toMatchObject({
        result: 'UNVERIFIABLE',
        reason: 'FINALIZED_BLOCK_HASH_CHANGED',
      });
    } finally {
      await reader.close();
    }
    const after = new Database(paths.databasePath, { readonly: true });
    expect(after.prepare('SELECT COUNT(*) AS count FROM indexed_blocks').get()).toEqual({
      count: 1,
    });
    after.close();
  });

  it('returns retained canonical block digest without changing source rows', async () => {
    const { root, paths } = await databaseFixture('source-audit-reader');
    roots.push(root);
    const db = new Database(paths.databasePath);
    db.prepare(
      `INSERT INTO indexed_blocks(
        deployment_id,block_hash,block_number,parent_hash,block_timestamp,is_canonical,
        scan_complete,log_scope_hash,observed_log_count,observed_log_digest
      ) VALUES (?,?,?,?,?,1,1,?,?,?)`,
    ).run(
      hashes.deployment,
      hashes.block,
      1,
      hashes.parent,
      1,
      hashes.scope,
      0,
      evidenceDigest([]),
    );
    db.close();

    const reader = await createReadOnlyReader(paths, hashes.deployment);
    expect(reader.sourceAuditRange('1', '1').data).toEqual([
      {
        blockNumber: '1',
        blockHash: hashes.block,
        parentHash: hashes.parent,
        scanComplete: true,
        logScopeHash: hashes.scope,
        observedLogCount: 0,
        observedLogDigest: evidenceDigest([]),
        events: [],
      },
    ]);
    await reader.close();

    const after = new Database(paths.databasePath, { readonly: true });
    expect(after.prepare('SELECT COUNT(*) AS count FROM indexed_blocks').get()).toEqual({
      count: 1,
    });
    after.close();
  });
});
