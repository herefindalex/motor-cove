import type { BlockHeader } from '../ports/index.js';

export async function catchUpToReindexTarget(
  checkpoint: () => Promise<BlockHeader | null>,
  ingestNext: () => Promise<void>,
  target: Pick<BlockHeader, 'number'>,
): Promise<void> {
  for (;;) {
    const before = await checkpoint();
    if (before && before.number >= target.number) return;

    await ingestNext();

    const after = await checkpoint();
    if (!after || after.number <= (before?.number ?? -1n)) {
      throw new Error('REINDEX_CATCHUP_NO_PROGRESS');
    }
  }
}
