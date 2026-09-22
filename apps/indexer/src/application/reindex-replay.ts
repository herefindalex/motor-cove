interface ReindexReplayStore<T> {
  prepareForReindex(fromBlock: bigint, options?: { readonly verifiedBackupId: string }): void;
  rebuildFromJournal(): T;
}

export function prepareReindexReplay<T>(
  store: ReindexReplayStore<T>,
  fromBlock: bigint,
  resumesCatchup: boolean,
  verifiedBackupId?: string,
): T {
  if (!resumesCatchup) {
    store.prepareForReindex(fromBlock, verifiedBackupId ? { verifiedBackupId } : undefined);
  }
  return store.rebuildFromJournal();
}
