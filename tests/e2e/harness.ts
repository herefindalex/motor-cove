import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const state = resolve(root, '.tmp/e2e');
rmSync(state, { recursive: true, force: true });
mkdirSync(state, { recursive: true });
const environment = {
  ...process.env,
  MOTORCOVE_RPC_URL: 'http://127.0.0.1:19545',
  MOTORCOVE_WORKSPACE_ROOT: state,
  MOTORCOVE_ENV: 'e2e',
  MOTORCOVE_API_PORT: '13001',
  MOTORCOVE_WORKER_HEARTBEAT_STALE_AFTER_MS: '1000',
  MOTORCOVE_WEB_ORIGIN: 'http://127.0.0.1:15173',
  VITE_MOTORCOVE_API_URL: 'http://127.0.0.1:13001',
  VITE_MOTORCOVE_RPC_URL: 'http://127.0.0.1:19545',
  VITE_MOTORCOVE_DEMO_WALLET: '1',
};
const children: ChildProcess[] = [];
const processGroups = new Set<number>();
const start = (command: string, args: string[], grouped = false) => {
  const child = spawn(command, args, {
    cwd: root,
    env: environment,
    stdio: 'inherit',
    detached: grouped,
  });
  children.push(child);
  if (grouped && child.pid) processGroups.add(child.pid);
  return child;
};
async function wait(url: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* retry */
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
async function waitRpc() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(environment.MOTORCOVE_RPC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      });
      if (response.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error('Timed out waiting for Anvil');
}
const anvil = start('anvil', [
  '--host',
  '127.0.0.1',
  '--port',
  '19545',
  '--chain-id',
  '31337',
  '--silent',
]);
await waitRpc();
execFileSync('corepack', ['pnpm', '--filter', '@motorcove/indexer', 'bootstrap'], {
  cwd: root,
  env: environment,
  stdio: 'inherit',
});
execFileSync('corepack', ['pnpm', '--filter', '@motorcove/indexer', 'exec', 'tsx', 'src/main.ts'], {
  cwd: root,
  env: { ...environment, MOTORCOVE_INDEXER_ONCE: '1' },
  stdio: 'inherit',
});
const indexer = start(process.execPath, ['--import', 'tsx', 'apps/indexer/src/main.ts'], true);
if (!indexer.pid) throw new Error('Indexer process did not expose a PID');
writeFileSync(`${state}/indexer.pid`, String(indexer.pid));
start('corepack', ['pnpm', '--filter', '@motorcove/api', 'exec', 'tsx', 'src/main.ts']);
await wait('http://127.0.0.1:13001/health/ready');
start('corepack', [
  'pnpm',
  '--filter',
  '@motorcove/web',
  'exec',
  'vite',
  '--host',
  '127.0.0.1',
  '--port',
  '15173',
]);
await wait('http://127.0.0.1:15173');
console.log('MotorCove E2E harness ready');
const waitForExit = (child: ChildProcess, milliseconds: number) =>
  child.exitCode !== null
    ? Promise.resolve()
    : Promise.race([
        new Promise<void>((resolveExit) => child.once('exit', () => resolveExit())),
        new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, milliseconds)),
      ]);

const signal = (child: ChildProcess, signalName: NodeJS.Signals, processGroup = false) => {
  if (!child.pid) return;
  try {
    if (processGroup && processGroups.has(child.pid)) process.kill(-child.pid, signalName);
    else child.kill(signalName);
  } catch {
    /* already stopped */
  }
};

let cleanupPromise: Promise<void> | undefined;
const cleanup = () => {
  cleanupPromise ??= (async () => {
    for (const child of children.reverse()) {
      signal(child, 'SIGTERM');
      await waitForExit(child, 3_000);
      if (child.exitCode === null) {
        signal(child, 'SIGKILL', true);
        await waitForExit(child, 3_000);
      }
    }
    rmSync(state, { recursive: true, force: true });
  })();
  return cleanupPromise;
};

const shutdown = () => {
  void cleanup().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
anvil.on('exit', (code) => {
  if (code && code !== 0) process.exit(code);
});
await new Promise<void>(() => undefined);
