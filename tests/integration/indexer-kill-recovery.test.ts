import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  environmentPaths,
  migrateEnvironment,
  registerDeployment,
  seedCatalog,
} from '@motorcove/database/maintenance';
import { openProjectionWriter } from '@motorcove/database/projection-writer';
import { localCatalogSeed } from '@motorcove/database/seeds';
import {
  SqliteProjectionStore,
  type CommitFaultPoint,
} from '../../apps/indexer/src/adapters/sqlite/sqlite-projection-store.js';
import type { OrderedEvent } from '../../apps/indexer/src/domain/events.js';
import type { BlockHeader } from '../../apps/indexer/src/ports/index.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const hex = (character: string, bytes: number): `0x${string}` => `0x${character.repeat(bytes * 2)}`;
const deploymentId = hex('a', 32);
const nft = hex('b', 20);
const escrow = hex('c', 20);
const seller = hex('d', 20);
const scopeHash = hex('1', 32);
const block: BlockHeader = {
  number: 1n,
  hash: hex('8', 32),
  parentHash: hex('7', 32),
  timestamp: 1_700_000_001n,
};
const events: OrderedEvent[] = [
  {
    blockNumber: block.number,
    blockHash: block.hash,
    transactionHash: hex('3', 32),
    transactionIndex: 0,
    logIndex: 1,
    contractAddress: nft,
    topics: [],
    data: '0x',
    event: { kind: 'Transfer', tokenId: '1', from: hex('0', 20), to: seller },
  },
  {
    blockNumber: block.number,
    blockHash: block.hash,
    transactionHash: hex('4', 32),
    transactionIndex: 1,
    logIndex: 0,
    contractAddress: escrow,
    topics: [],
    data: '0x',
    event: {
      kind: 'SaleCreated',
      saleId: '1',
      tokenId: '1',
      seller,
      priceWei: '1000000000000000000',
    },
  },
];

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'motorcove-kill-'));
  roots.push(root);
  const paths = environmentPaths(root, 'kill-test');
  await migrateEnvironment(paths);
  await registerDeployment(paths, {
    deploymentId,
    chainId: '31337',
    nftAddress: nft,
    escrowAddress: escrow,
    protocolVersion: '0.1.0',
    abiBundleHash: hex('2', 32),
    scanStartBlock: 1,
    nftDeploymentBlock: 1,
    nftDeploymentHash: hex('3', 32),
    nftRuntimeCodeHash: hex('4', 32),
    escrowDeploymentBlock: 1,
    escrowDeploymentHash: hex('5', 32),
    escrowRuntimeCodeHash: hex('6', 32),
    manifestHash: hex('7', 32),
    manifestJson: JSON.stringify({ deploymentId }),
    logScopeHash: scopeHash,
  });
  await seedCatalog(paths, localCatalogSeed(deploymentId, nft));
  return { root, paths };
}

async function waitForMarker(path: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!existsSync(path)) {
    if (child.exitCode !== null) throw new Error(`child exited before marker: ${child.exitCode}`);
    if (Date.now() > deadline) throw new Error('fault marker timeout');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  const marker = JSON.parse(readFileSync(path, 'utf8')) as { pid: number };
  expect(marker.pid).toBe(child.pid);
}

async function killAt(point: CommitFaultPoint) {
  const { root, paths } = await fixture();
  const writer = await openProjectionWriter(paths);
  const before = {
    checkpoint: writer.database
      .prepare('SELECT last_scanned_block AS value FROM indexer_checkpoint WHERE deployment_id=?')
      .get(deploymentId) as { value: number },
    events: writer.database
      .prepare('SELECT count(*) AS value FROM chain_events WHERE deployment_id=?')
      .get(deploymentId) as { value: number },
    sales: writer.database
      .prepare('SELECT count(*) AS value FROM sales WHERE deployment_id=?')
      .get(deploymentId) as { value: number },
  };
  await writer.close();

  const marker = join(root, `${point}.json`);
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      resolve('tests/fixtures/indexer-commit-child.ts'),
      root,
      'kill-test',
      point,
      marker,
    ],
    { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
  );
  await waitForMarker(marker, child);
  if (!child.pid) throw new Error('child pid unavailable');
  process.kill(child.pid, 'SIGKILL');
  const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolveExit) => child.once('exit', (code, signal) => resolveExit({ code, signal })),
  );
  expect(exit.signal).toBe('SIGKILL');

  const recovered = await openProjectionWriter(paths);
  const after = {
    checkpoint: recovered.database
      .prepare('SELECT last_scanned_block AS value FROM indexer_checkpoint WHERE deployment_id=?')
      .get(deploymentId) as { value: number },
    events: recovered.database
      .prepare('SELECT count(*) AS value FROM chain_events WHERE deployment_id=?')
      .get(deploymentId) as { value: number },
    sales: recovered.database
      .prepare('SELECT count(*) AS value FROM sales WHERE deployment_id=?')
      .get(deploymentId) as { value: number },
  };
  return { before, after, recovered };
}

describe('Indexer SQLite process-kill recovery', () => {
  it.each(['BEFORE_BEGIN', 'BEFORE_COMMIT'] as const)(
    'leaves only the previous committed snapshot when killed at %s',
    async (point) => {
      const { before, after, recovered } = await killAt(point);
      expect(after).toEqual(before);
      const store = new SqliteProjectionStore(recovered.database, deploymentId, nft, scopeHash);
      await store.commit([block], events, block);
      expect(
        (
          recovered.database
            .prepare(
              'SELECT last_scanned_block AS value FROM indexer_checkpoint WHERE deployment_id=?',
            )
            .get(deploymentId) as { value: number }
        ).value,
      ).toBe(1);
      await recovered.close();
    },
  );

  it('retains the new checkpoint when killed after COMMIT and replays as a no-op', async () => {
    const { after, recovered } = await killAt('AFTER_COMMIT');
    expect(after.checkpoint.value).toBe(1);
    expect(after.events.value).toBe(2);
    expect(after.sales.value).toBe(1);
    const store = new SqliteProjectionStore(recovered.database, deploymentId, nft, scopeHash);
    await store.commit([block], events, block);
    expect(
      (
        recovered.database
          .prepare('SELECT count(*) AS value FROM chain_events WHERE deployment_id=?')
          .get(deploymentId) as { value: number }
      ).value,
    ).toBe(2);
    await recovered.close();
  });
});
