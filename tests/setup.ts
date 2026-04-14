import { beforeEach } from 'vitest';

const store: Record<string, unknown> = {};

const mockStorage = {
  local: {
    get: async (keys: string | string[]) => {
      const keyList = typeof keys === 'string' ? [keys] : keys;
      const result: Record<string, unknown> = {};
      for (const k of keyList) {
        if (k in store) result[k] = store[k];
      }
      return result;
    },
    set: async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    },
    remove: async (keys: string | string[]) => {
      const keyList = typeof keys === 'string' ? [keys] : keys;
      for (const k of keyList) delete store[k];
    },
  },
};

const sessionStore: Record<string, unknown> = {};

const mockSessionStorage = {
  get: async (keys: string | string[]) => {
    const keyList = typeof keys === 'string' ? [keys] : keys;
    const result: Record<string, unknown> = {};
    for (const k of keyList) {
      if (k in sessionStore) result[k] = sessionStore[k];
    }
    return result;
  },
  set: async (items: Record<string, unknown>) => {
    Object.assign(sessionStore, items);
  },
};

Object.defineProperty(globalThis, 'chrome', {
  value: { storage: { ...mockStorage, session: mockSessionStorage }, runtime: { id: 'test' } },
  writable: true,
});

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  for (const k of Object.keys(sessionStore)) delete sessionStore[k];
});
