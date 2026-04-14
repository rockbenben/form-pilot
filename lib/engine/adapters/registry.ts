import type { PlatformAdapter } from './types';
import { mokaAdapter } from './moka';

const adapters: PlatformAdapter[] = [mokaAdapter];

export function findAdapter(url: string): PlatformAdapter | null {
  for (const adapter of adapters) {
    const patterns = Array.isArray(adapter.matchUrl) ? adapter.matchUrl : [adapter.matchUrl];
    if (patterns.some((p) => p.test(url))) return adapter;
  }
  return null;
}
