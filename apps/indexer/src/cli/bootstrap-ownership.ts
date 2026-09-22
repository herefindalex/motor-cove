import { acquireBootstrapOwnership } from '@motorcove/database/maintenance';
import type { EnvironmentPaths } from '@motorcove/database/types';

export async function withBootstrapOwnership<T>(
  paths: EnvironmentPaths,
  operation: () => Promise<T>,
): Promise<T> {
  const ownership = await acquireBootstrapOwnership(paths);
  try {
    return await operation();
  } finally {
    await ownership.release();
  }
}
