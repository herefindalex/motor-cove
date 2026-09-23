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
  await expect(asset.getByRole('button', { name: 'Create sale' })).toBeDisabled();
  await asset.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(/Transaction submitted\. Waiting for inclusion\./)).toBeVisible();
  await expect(asset.getByText('Approved on-chain')).toBeVisible();
  await asset.getByRole('button', { name: 'Create sale' }).click();
  const card = page.locator('.card').filter({ hasText: 'Harbor RS' });
  await expect(card.getByText('LISTED')).toBeVisible();
  await page.evaluate(async () =>
    (
      window as unknown as { __motorCoveTestWallet: { select(index: number): Promise<void> } }
    ).__motorCoveTestWallet.select(2),
  );
  await page.evaluate(() => {
    const prototype = Object.getPrototypeOf(window.localStorage) as Storage;
    const original = prototype.setItem;
    let journalWrites = 0;
    Object.defineProperty(prototype, 'setItem', {
      configurable: true,
      value(this: Storage, key: string, value: string) {
        if (key.startsWith('motorcove:journal:v1:')) {
          journalWrites += 1;
          if (journalWrites >= 3) throw new Error('CONTROLLED_JOURNAL_WRITE_FAILURE');
        }
        return original.call(this, key, value);
      },
    });
  });
  await card.getByRole('button', { name: 'Fund exactly' }).click();
  const nonDurableNotice = page.getByRole('alert');
  await expect(nonDurableNotice).toContainText('journal could not persist it');
  await expect(nonDurableNotice).toContainText('Reloading may lose local tracking context');
  const submittedHash = await nonDurableNotice.locator('code').textContent();
  if (!submittedHash) throw new Error('Missing non-durable transaction hash');
  const submissionsBeforeNavigation = await page.evaluate(() =>
    (
      window as unknown as {
        __motorCoveTestWallet: { submissionCount(): number };
      }
    ).__motorCoveTestWallet.submissionCount(),
  );
  await card.getByRole('link', { name: 'Harbor RS' }).click();
  await expect(page).toHaveURL(/\/sales\/\d+$/);
  await expect(
    page
      .getByRole('region', { name: 'Transaction timeline' })
      .getByText(submittedHash, { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (
        window as unknown as {
          __motorCoveTestWallet: { submissionCount(): number };
        }
      ).__motorCoveTestWallet.submissionCount(),
    ),
  ).toBe(submissionsBeforeNavigation);

  await page.reload();
  await expect(page.getByText(submittedHash, { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('listitem').filter({ hasText: 'FUND SALE' }).getByText('AWAITING_WALLET'),
  ).toBeVisible();
  await expect(card.getByText('FUNDED')).toBeVisible();
  await page.getByRole('button', { name: 'Connect wallet' }).click();
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
  await expect(asset.getByRole('button', { name: 'Create sale' })).toBeDisabled();
  await asset.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(/Transaction submitted\. Waiting for inclusion\./)).toBeVisible();
  await expect(asset.getByText('Approved on-chain')).toBeVisible();
  await asset.getByRole('button', { name: 'Create sale' }).click();
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
  await expect(
    page.getByText(/Wallet request rejected\. No transaction submission was confirmed\./),
  ).toBeVisible();
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
  const candidateHash = page.getByLabel('Candidate transaction hash from wallet activity');
  await candidateHash.fill(lostHash);
  await candidateHash
    .locator('xpath=ancestor::article')
    .getByRole('button', {
      name: 'Recheck evidence',
    })
    .click();
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

  const durableSnapshot = await page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith('motorcove:journal:v1:')) {
        return { key, value: localStorage.getItem(key) };
      }
    }
    throw new Error('Missing durable transaction journal');
  });
  let inspectionReadsAfterStorageFailure = 0;
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:19545')) return;
    const payload: unknown = request.postDataJSON();
    const requests: readonly unknown[] = Array.isArray(payload)
      ? payload
      : payload
        ? [payload]
        : [];
    inspectionReadsAfterStorageFailure += requests.filter(
      (candidate) =>
        typeof candidate === 'object' &&
        candidate !== null &&
        'method' in candidate &&
        candidate.method === 'eth_getTransactionByHash',
    ).length;
  });
  await page.evaluate(() => {
    const prototype = Object.getPrototypeOf(window.localStorage) as Storage;
    const original = prototype.setItem;
    Object.defineProperty(prototype, 'setItem', {
      configurable: true,
      value(this: Storage, key: string, value: string) {
        if (key.startsWith('motorcove:journal:v1:')) {
          throw new DOMException('Controlled quota failure', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      },
    });
  });

  const reflectedRecovery = page
    .getByRole('article')
    .filter({ hasText: 'This funding payment is reflected in the marketplace projection.' });
  await reflectedRecovery.getByRole('button', { name: 'Recheck evidence' }).click();
  await expect(page.getByText('Latest verification is available only in this tab.')).toBeVisible();
  await expect.poll(() => inspectionReadsAfterStorageFailure).toBeGreaterThan(0);
  expect(
    await page.evaluate(() =>
      (
        window as unknown as {
          __motorCoveTestWallet: { submissionCount(): number };
        }
      ).__motorCoveTestWallet.submissionCount(),
    ),
  ).toBe(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), durableSnapshot.key)).toBe(
    durableSnapshot.value,
  );

  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Transaction timeline' }).getByText(lostHash, { exact: true }),
  ).toBeVisible();
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
  await expect(asset.getByRole('button', { name: 'Create sale' })).toBeDisabled();
  await asset.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(/Transaction submitted\. Waiting for inclusion\./)).toBeVisible();
  await expect(asset.getByText('Approved on-chain')).toBeVisible();
  await asset.getByRole('button', { name: 'Create sale' }).click();
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

    const browser = page.context().browser();
    if (!browser) throw new Error('Playwright browser is unavailable');
    const observerContext = await browser.newContext();
    try {
      const observerPage = await observerContext.newPage();
      await observerPage.goto('http://127.0.0.1:15173/');
      await expect(
        observerPage.getByText(
          /Indexer observation stale .* last known projection CURRENT .* current lag unknown/,
        ),
      ).toBeVisible({ timeout: 10_000 });
      await expect(observerPage.getByRole('listitem').filter({ hasText: 'FUND SALE' })).toHaveCount(
        0,
      );
    } finally {
      await observerContext.close();
    }

    const durableFunding = await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith('motorcove:journal:v1:')) continue;
        const value = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
        if (!Array.isArray(value)) continue;
        for (const candidate of value as unknown[]) {
          if (
            typeof candidate === 'object' &&
            candidate !== null &&
            'action' in candidate &&
            candidate.action === 'FUND_SALE' &&
            'status' in candidate &&
            candidate.status === 'INCLUDED_SUCCESS'
          )
            return true;
        }
      }
      return false;
    });
    expect(durableFunding).toBe(true);

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
