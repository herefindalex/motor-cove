import { describe, expect, it, vi } from 'vitest';
import { ChainTransportUnavailableError } from './ingest-range.js';
import { runIndexerLoop } from './run-indexer.js';

describe('runIndexerLoop', () => {
  it('marks temporary transport failures stale, backs off, and resumes polling', async () => {
    let attempts = 0;
    const waits: number[] = [];
    const markStale = vi.fn();

    await runIndexerLoop({
      poll: async () => {
        attempts += 1;
        if (attempts < 3)
          throw new ChainTransportUnavailableError('chain head', new Error('timeout'));
      },
      markStale,
      wait: async (milliseconds) => {
        waits.push(milliseconds);
      },
      shouldStop: () => attempts === 3,
    });

    expect(attempts).toBe(3);
    expect(waits).toEqual([1_000, 2_000]);
    expect(markStale).toHaveBeenCalledTimes(2);
  });

  it('stops on an integrity failure instead of treating it as transport', async () => {
    const markStale = vi.fn();
    await expect(
      runIndexerLoop({
        poll: async () => {
          throw new Error('RECOVERY_REQUIRED: checkpoint hash changed');
        },
        markStale,
        wait: async () => undefined,
      }),
    ).rejects.toThrow('RECOVERY_REQUIRED: checkpoint hash changed');
    expect(markStale).not.toHaveBeenCalled();
  });

  it('waits for the active poll before honoring a graceful stop', async () => {
    let stopping = false;
    let finishPoll: (() => void) | undefined;
    const activePoll = new Promise<void>((resolve) => {
      finishPoll = resolve;
    });
    const poll = vi.fn(async () => activePoll);
    const running = runIndexerLoop({
      poll,
      markStale: vi.fn(),
      wait: async () => undefined,
      shouldStop: () => stopping,
    });

    await vi.waitFor(() => expect(poll).toHaveBeenCalledTimes(1));
    stopping = true;
    let completed = false;
    void running.then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);

    finishPoll?.();
    await expect(running).resolves.toBeUndefined();
    expect(poll).toHaveBeenCalledTimes(1);
  });
});
