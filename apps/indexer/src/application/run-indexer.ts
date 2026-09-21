import { ChainTransportUnavailableError } from './ingest-range.js';

export interface IndexerLoopOptions {
  readonly poll: () => Promise<void>;
  readonly markStale: (reason: string) => Promise<void> | void;
  readonly wait?: (milliseconds: number) => Promise<void>;
  readonly shouldStop?: () => boolean;
  readonly once?: boolean;
  readonly baseDelayMs?: number;
  readonly maximumDelayMs?: number;
}

const defaultWait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function runIndexerLoop(options: IndexerLoopOptions): Promise<void> {
  const wait = options.wait ?? defaultWait;
  const shouldStop = options.shouldStop ?? (() => false);
  const baseDelayMs = options.baseDelayMs ?? 1_000;
  const maximumDelayMs = options.maximumDelayMs ?? 8_000;
  let retryDelayMs = baseDelayMs;

  while (!shouldStop()) {
    try {
      await options.poll();
      retryDelayMs = baseDelayMs;
    } catch (error) {
      if (!(error instanceof ChainTransportUnavailableError)) throw error;
      await options.markStale(error.message);
      if (options.once) throw error;
      if (shouldStop()) return;
      await wait(retryDelayMs);
      retryDelayMs = Math.min(retryDelayMs * 2, maximumDelayMs);
      continue;
    }

    if (options.once || shouldStop()) return;
    await wait(baseDelayMs);
  }
}
