import { describe, expect, it, vi } from 'vitest';
import { prepareReindexReplay } from './reindex-replay.js';

describe('prepareReindexReplay', () => {
  it('rewinds a new operation before rebuilding its projection', () => {
    const store = {
      prepareForReindex: vi.fn(),
      rebuildFromJournal: vi.fn(() => ({ events: 3 })),
    };

    expect(prepareReindexReplay(store, 10n, false, 'verified-backup')).toEqual({ events: 3 });
    expect(store.prepareForReindex).toHaveBeenCalledWith(10n, {
      verifiedBackupId: 'verified-backup',
    });
  });

  it('preserves durable source progress when the same operation resumes catch-up', () => {
    const store = {
      prepareForReindex: vi.fn(),
      rebuildFromJournal: vi.fn(() => ({ events: 1000 })),
    };

    expect(prepareReindexReplay(store, 1n, true)).toEqual({ events: 1000 });
    expect(store.prepareForReindex).not.toHaveBeenCalled();
    expect(store.rebuildFromJournal).toHaveBeenCalledOnce();
  });
});
