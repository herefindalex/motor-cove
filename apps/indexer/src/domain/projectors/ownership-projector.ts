import type { NormalizedEvent } from '../events.js';
export function projectOwnership(
  current: string | undefined,
  event: NormalizedEvent,
): string | undefined {
  return event.kind === 'Transfer' ? event.to : current;
}
