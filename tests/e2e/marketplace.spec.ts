import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ rpcUrl }) => {
      type Listener = (...args: unknown[]) => void;
      class TestAnvilProvider {
        readonly isMetaMask = true;
        private connected = false;
        private accountIndex = 2;
        private chainId = 31337;
        private rejectNextTransaction = false;
        private delayNextTransactionMs = 0;
        private loseNextTransactionResponse = false;
        private lastLostTransactionHash: string | undefined;
        private transactionSubmissionCount = 0;
        private readonly transactionSubmissionMethods: string[] = [];
        private readonly listeners = new Map<string, Set<Listener>>();
        async request({ method, params = [] }: { method: string; params?: unknown[] }) {
          if (method === 'wallet_switchEthereumChain') {
            this.chainId = 31337;
            for (const listener of this.listeners.get('chainChanged') ?? []) listener('0x7a69');
            return null;
          }
          if (method === 'wallet_addEthereumChain') return null;
          if (method === 'eth_chainId') return `0x${this.chainId.toString(16)}`;
          const accountsResponse = async () =>
            (
              (await (
                await fetch(rpcUrl, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_accounts',
                    params: [],
                  }),
                })
              ).json()) as { result: string[] }
            ).result;
          if (method === 'eth_requestAccounts') {
            this.connected = true;
            const accounts = await accountsResponse();
            return [accounts[this.accountIndex]];
          }
          if (method === 'eth_accounts') {
            if (!this.connected) return [];
            const accounts = await accountsResponse();
            return [accounts[this.accountIndex]];
          }
          const isTransactionSubmission =
            method === 'eth_sendTransaction' || method === 'wallet_sendTransaction';
          if (isTransactionSubmission) {
            this.transactionSubmissionCount += 1;
            this.transactionSubmissionMethods.push(method);
            if (this.rejectNextTransaction) {
              this.rejectNextTransaction = false;
              throw Object.assign(new Error('User rejected the request'), { code: 4001 });
            }
            if (this.delayNextTransactionMs > 0) {
              const delay = this.delayNextTransactionMs;
              this.delayNextTransactionMs = 0;
              await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
            }
          }
          const response = (await (
            await fetch(rpcUrl, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
            })
          ).json()) as { result?: unknown; error?: { message: string; code: number } };
          if (response.error)
            throw Object.assign(new Error(response.error.message), { code: response.error.code });
          if (isTransactionSubmission && this.loseNextTransactionResponse) {
            this.loseNextTransactionResponse = false;
            this.lastLostTransactionHash = response.result as string;
            throw Object.assign(new Error('Wallet transport closed after broadcast'), {
              code: 4900,
            });
          }
          return response.result;
        }
        on(event: string, listener: Listener) {
          const group = this.listeners.get(event) ?? new Set<Listener>();
          group.add(listener);
          this.listeners.set(event, group);
        }
        removeListener(event: string, listener: Listener) {
          this.listeners.get(event)?.delete(listener);
        }
        async select(index: number) {
          this.accountIndex = index;
          const accounts = (await this.request({ method: 'eth_accounts' })) as string[];
          for (const listener of this.listeners.get('accountsChanged') ?? []) listener(accounts);
        }
        setChainId(chainId: number) {
          this.chainId = chainId;
          for (const listener of this.listeners.get('chainChanged') ?? [])
            listener(`0x${chainId.toString(16)}`);
        }
        rejectNext() {
          this.rejectNextTransaction = true;
        }
        delayNext(milliseconds: number) {
          this.delayNextTransactionMs = milliseconds;
        }
        loseNextResponse() {
          this.loseNextTransactionResponse = true;
        }
        lostTransactionHash() {
          return this.lastLostTransactionHash;
        }
        submissionCount() {
          return this.transactionSubmissionCount;
        }
        submissionMethods() {
          return [...this.transactionSubmissionMethods];
        }
      }
      const provider = new TestAnvilProvider();
      Object.defineProperty(window, 'ethereum', { value: provider, configurable: false });
      Object.defineProperty(window, '__motorCoveTestWallet', { value: provider });
    },
    { rpcUrl: 'http://127.0.0.1:19545' },
  );
});

test('uses the explicit local demo wallet for real fund, complete, and withdraw transactions', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText('Apex GT')).toBeVisible();
  await page.getByRole('button', { name: 'Use local buyer' }).click();
  await expect(page.getByRole('button', { name: 'Fund exactly' })).toBeEnabled();
  await page.getByRole('button', { name: 'Fund exactly' }).click();
  await expect(page.getByText('FUNDED')).toBeVisible();
  await page.getByRole('button', { name: 'Complete sale' }).click();
  await expect(page.getByText('COMPLETED')).toBeVisible();
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await page.getByRole('button', { name: 'Use local seller' }).click();
  await expect(page.getByRole('button', { name: 'Withdraw proceeds' })).toBeEnabled();
  await page.getByRole('button', { name: 'Withdraw proceeds' }).click();
  await expect(page.getByText('WITHDRAWN')).toBeVisible();
});

test('lists, expires, refunds, and reclaims through distinct real transactions', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await page.evaluate(async () =>
    (
      window as unknown as { __motorCoveTestWallet: { select(index: number): Promise<void> } }
    ).__motorCoveTestWallet.select(1),
  );
  const asset = page.locator('.asset').filter({ hasText: 'Harbor RS' });
  await asset.getByRole('button', { name: '1. Approve' }).click();
  await expect(page.getByText(/Submitted 0x/)).toBeVisible();
  await page.waitForTimeout(500);
  await asset.getByRole('button', { name: '2. Create sale' }).click();
  const card = page.locator('.card').filter({ hasText: 'Harbor RS' });
  await expect(card.getByText('LISTED')).toBeVisible();
  await page.evaluate(async () =>
    (
      window as unknown as { __motorCoveTestWallet: { select(index: number): Promise<void> } }
    ).__motorCoveTestWallet.select(2),
  );
  await card.getByRole('button', { name: 'Fund exactly' }).click();
  await expect(card.getByText('FUNDED')).toBeVisible();
  await request.post('http://127.0.0.1:19545', {
    data: { jsonrpc: '2.0', id: 1, method: 'evm_increaseTime', params: [301] },
  });
  await request.post('http://127.0.0.1:19545', {
    data: { jsonrpc: '2.0', id: 2, method: 'evm_mine', params: [] },
  });
  await expect(card.getByRole('button', { name: 'Execute expiry' })).toBeVisible();
  await card.getByRole('button', { name: 'Execute expiry' }).click();
  await expect(card.getByRole('button', { name: 'Withdraw refund' })).toBeVisible();
  await card.getByRole('button', { name: 'Withdraw refund' }).click();
  await expect(card.getByText(/Buyer refund:\s*WITHDRAWN/)).toBeVisible();
  await page.evaluate(async () =>
    (
      window as unknown as { __motorCoveTestWallet: { select(index: number): Promise<void> } }
    ).__motorCoveTestWallet.select(1),
  );
  await expect(card.getByRole('button', { name: 'Reclaim NFT' })).toBeVisible();
  await card.getByRole('button', { name: 'Reclaim NFT' }).click();
  await expect(card.getByRole('button', { name: 'Reclaim NFT' })).toHaveCount(0);
});

test('surfaces network and rejection states, then recovers a lost wallet response read-only', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () =>
    (
      window as unknown as {
        __motorCoveTestWallet: { setChainId(chainId: number): void };
      }
    ).__motorCoveTestWallet.setChainId(1),
  );
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await expect(page.getByText('Wrong network (1)')).toBeVisible();
  await page.getByRole('button', { name: 'Switch to local chain' }).click();
  await expect(page.getByRole('button', { name: 'Disconnect' })).toBeVisible();

  await page.evaluate(async () =>
    (
      window as unknown as {
        __motorCoveTestWallet: { select(index: number): Promise<void> };
      }
    ).__motorCoveTestWallet.select(1),
  );
  const asset = page.locator('.asset').filter({ hasText: 'Cinder XR' });
  await asset.getByRole('button', { name: '1. Approve' }).click();
  await expect(page.getByText(/Submitted 0x/)).toBeVisible();
  await page.waitForTimeout(500);
  await asset.getByRole('button', { name: '2. Create sale' }).click();
  const card = page.locator('.card').filter({ hasText: 'Cinder XR' });
  await expect(card.getByText('LISTED')).toBeVisible();
  await page.evaluate(async () =>
    (
      window as unknown as {
        __motorCoveTestWallet: { select(index: number): Promise<void>; rejectNext(): void };
      }
    ).__motorCoveTestWallet.select(2),
  );
  await page.evaluate(() =>
    (
      window as unknown as {
        __motorCoveTestWallet: { rejectNext(): void };
      }
    ).__motorCoveTestWallet.rejectNext(),
  );
  await card.getByRole('button', { name: 'Fund exactly' }).click();
  await expect(page.getByText('Wallet request rejected.')).toBeVisible();
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: 'FUND SALE' })
      .getByText('REJECTED', { exact: true }),
  ).toBeVisible();
  const submissionsBeforeLostResponse = await page.evaluate(() =>
    (
      window as unknown as {
        __motorCoveTestWallet: { submissionCount(): number };
      }
    ).__motorCoveTestWallet.submissionCount(),
  );
  await page.evaluate(() =>
    (
      window as unknown as {
        __motorCoveTestWallet: { loseNextResponse(): void };
      }
    ).__motorCoveTestWallet.loseNextResponse(),
  );

  await card.getByRole('button', { name: 'Fund exactly' }).click();
  const fundingEntry = page.getByRole('listitem').filter({ hasText: 'FUND SALE' });
  await expect(fundingEntry.getByText('UNKNOWN', { exact: true })).toBeVisible();
  const lostHash = await page.evaluate(() =>
    (
      window as unknown as {
        __motorCoveTestWallet: {
          lostTransactionHash(): string | undefined;
          submissionCount(): number;
        };
      }
    ).__motorCoveTestWallet.lostTransactionHash(),
  );
  expect(lostHash).toMatch(/^0x[0-9a-f]{64}$/);
  if (!lostHash) throw new Error('Expected the test wallet to retain the lost transaction hash');
  const submissionMethods = await page.evaluate(() =>
    (
      window as unknown as {
        __motorCoveTestWallet: { submissionMethods(): string[] };
      }
    ).__motorCoveTestWallet.submissionMethods(),
  );
  expect(submissionMethods.slice(submissionsBeforeLostResponse)).toEqual(['eth_sendTransaction']);
  expect(
    await page.evaluate(() =>
      (
        window as unknown as {
          __motorCoveTestWallet: { submissionCount(): number };
        }
      ).__motorCoveTestWallet.submissionCount(),
    ),
  ).toBe(submissionsBeforeLostResponse + 1);

  await page.reload();
  await page.getByLabel('Candidate transaction hash from wallet activity').fill(lostHash);
  await page.getByRole('button', { name: 'Recheck evidence' }).click();
  await expect(
    page.getByText('This funding payment is reflected in the marketplace projection.'),
  ).toBeVisible({ timeout: 15_000 });
  expect(
    await page.evaluate(() =>
      (
        window as unknown as {
          __motorCoveTestWallet: { submissionCount(): number };
        }
      ).__motorCoveTestWallet.submissionCount(),
    ),
  ).toBe(0);
});

test('keeps pending and included evidence across reload while projection catches up', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await page.evaluate(async () =>
    (
      window as unknown as {
        __motorCoveTestWallet: { select(index: number): Promise<void> };
      }
    ).__motorCoveTestWallet.select(1),
  );
  const asset = page.locator('.asset').filter({ hasText: 'Vale Touring' });
  await asset.getByRole('button', { name: '1. Approve' }).click();
  await expect(page.getByText(/Submitted 0x/)).toBeVisible();
  await page.waitForTimeout(500);
  await asset.getByRole('button', { name: '2. Create sale' }).click();
  const card = page.locator('.card').filter({ hasText: 'Vale Touring' });
  await expect(card.getByText('LISTED')).toBeVisible();

  const indexerPid = Number(readFileSync('.tmp/e2e/indexer.pid', 'utf8'));
  process.kill(-indexerPid, 'SIGSTOP');
  try {
    await page.evaluate(async () =>
      (
        window as unknown as {
          __motorCoveTestWallet: {
            select(index: number): Promise<void>;
            delayNext(ms: number): void;
          };
        }
      ).__motorCoveTestWallet.select(2),
    );
    await page.evaluate(() =>
      (
        window as unknown as {
          __motorCoveTestWallet: { delayNext(ms: number): void };
        }
      ).__motorCoveTestWallet.delayNext(1_500),
    );
    const originalAccount = await page.evaluate(async () =>
      (
        window as unknown as {
          __motorCoveTestWallet: {
            request(input: { method: string }): Promise<string[]>;
          };
        }
      ).__motorCoveTestWallet
        .request({ method: 'eth_accounts' })
        .then((accounts) => accounts[0]),
    );
    await card.getByRole('button', { name: 'Fund exactly' }).click();
    const fundingEntry = page.getByRole('listitem').filter({ hasText: 'FUND SALE' });
    await expect(fundingEntry.getByText('AWAITING_WALLET')).toBeVisible();
    await page.evaluate(async () =>
      (
        window as unknown as {
          __motorCoveTestWallet: { select(index: number): Promise<void> };
        }
      ).__motorCoveTestWallet.select(0),
    );
    await expect(fundingEntry.getByText('INCLUDED_SUCCESS')).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(`Original account ${originalAccount} on chain 31337.`),
    ).toBeVisible();
    await expect(page.getByText(/Projection STALE/)).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(
      page.getByRole('listitem').filter({ hasText: 'FUND SALE' }).getByText('INCLUDED_SUCCESS'),
    ).toBeVisible();
    await expect(card.getByText('LISTED')).toBeVisible();
  } finally {
    process.kill(-indexerPid, 'SIGCONT');
  }

  await expect(card.getByText('FUNDED')).toBeVisible({ timeout: 15_000 });
});
