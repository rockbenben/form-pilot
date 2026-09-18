import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FieldCandidate } from '@/lib/capture/candidate';
import type { InputType } from '@/lib/engine/adapters/types';

// Hoisted so the mock factories below can reference them before the module
// under test is imported.
const mocks = vi.hoisted(() => ({
  fillElement: vi.fn(),
  detectElementKind: vi.fn(),
}));

vi.mock('@/lib/engine/heuristic/fillers', () => ({ fillElement: mocks.fillElement }));
vi.mock('@/lib/capture/element-value', () => ({
  detectElementKind: mocks.detectElementKind,
}));

import { createPickerHandlers, type PickerHandlersDeps } from '@/lib/capture/picker-wiring';

function mk(id: string, partial: Partial<FieldCandidate> = {}): FieldCandidate {
  return {
    id,
    value: `value-${id}`,
    displayValue: undefined,
    label: undefined,
    hitCount: 1,
    createdAt: 0,
    updatedAt: 0,
    lastUrl: '',
    ...partial,
  };
}

type Spied = {
  refresh: ReturnType<typeof vi.fn>;
  retire: ReturnType<typeof vi.fn>;
  onBump: ReturnType<typeof vi.fn>;
  onRemember: ReturnType<typeof vi.fn>;
  onPin: ReturnType<typeof vi.fn>;
  onDelete: ReturnType<typeof vi.fn>;
};

function makeDeps(overrides: Partial<PickerHandlersDeps> = {}): PickerHandlersDeps & Spied {
  const spies: Spied = {
    refresh: vi.fn(),
    retire: vi.fn(),
    onBump: vi.fn(),
    onRemember: vi.fn(),
    onPin: vi.fn(async () => undefined),
    onDelete: vi.fn(async () => undefined),
  };
  return {
    element: document.createElement('input'),
    signature: 'sig',
    currentDomain: 'workday.com',
    t: (key, vars) => `${key}${vars ? `|${JSON.stringify(vars)}` : ''}`,
    prompted: new Set<string>(),
    state: { candidates: [mk('a'), mk('b')], pinnedId: null },
    valueFor: (c) => c.value,
    fallbackKind: 'text' as InputType,
    rememberPromptValue: (_c, filled) => filled,
    manageAllHash: '#savedPages',
    ...spies,
    ...overrides,
  } as PickerHandlersDeps & Spied;
}

let confirmSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.restoreAllMocks();
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  mocks.fillElement.mockReset().mockResolvedValue(true);
  mocks.detectElementKind.mockReset().mockReturnValue(null);
  (globalThis as unknown as { chrome: { runtime: Record<string, unknown> } }).chrome.runtime = {
    id: 'test',
    getURL: (p: string) => `chrome-extension://test${p}`,
  };
});

describe('createPickerHandlers / onSelect', () => {
  it('writes the value from valueFor using the element\'s own kind', async () => {
    mocks.detectElementKind.mockReturnValue('select');
    const deps = makeDeps();
    await createPickerHandlers(deps).onSelect('a');

    expect(mocks.fillElement).toHaveBeenCalledWith(deps.element, 'value-a', 'select');
  });

  it('falls back to fallbackKind when the element kind is unknown', async () => {
    mocks.detectElementKind.mockReturnValue(null);
    const deps = makeDeps({ fallbackKind: 'textarea' });
    await createPickerHandlers(deps).onSelect('a');

    expect(mocks.fillElement).toHaveBeenCalledWith(deps.element, 'value-a', 'textarea');
  });

  it('reports the hit and offers to remember, after a successful fill', async () => {
    const deps = makeDeps();
    await createPickerHandlers(deps).onSelect('a');

    expect(deps.onBump).toHaveBeenCalledTimes(1);
    expect(deps.onBump.mock.calls[0][0].id).toBe('a');
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(deps.onRemember).toHaveBeenCalledTimes(1);
    expect(deps.onRemember.mock.calls[0][0].id).toBe('a');
  });

  it('quotes the filled value in the prompt', async () => {
    const deps = makeDeps();
    await createPickerHandlers(deps).onSelect('a');

    const msg = confirmSpy.mock.calls[0][0] as string;
    expect(msg).toContain('candidate.domainPref.rememberToast');
    expect(msg).toContain('value-a');
    expect(msg).toContain('workday.com');
  });

  it('reports nothing when the write did not land', async () => {
    mocks.fillElement.mockResolvedValue(false);
    const deps = makeDeps();
    await createPickerHandlers(deps).onSelect('a');

    expect(deps.onBump).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(deps.onRemember).not.toHaveBeenCalled();
    // …and the prompt is still available for a later, successful fill.
    expect(deps.prompted.size).toBe(0);
  });

  it('reports nothing when the write throws', async () => {
    mocks.fillElement.mockRejectedValue(new Error('read-only'));
    const deps = makeDeps();
    await createPickerHandlers(deps).onSelect('a');

    expect(deps.onBump).not.toHaveBeenCalled();
    expect(deps.prompted.size).toBe(0);
  });

  it('prompts once per (signature, domain) per session', async () => {
    const deps = makeDeps();
    const h = createPickerHandlers(deps);

    await h.onSelect('a');
    await h.onSelect('b');
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    // Both fills still count as hits.
    expect(deps.onBump).toHaveBeenCalledTimes(2);
  });

  it('prompts again on a different domain', async () => {
    const prompted = new Set<string>();
    await createPickerHandlers(makeDeps({ prompted, currentDomain: 'workday.com' })).onSelect('a');
    await createPickerHandlers(makeDeps({ prompted, currentDomain: 'lagou.com' })).onSelect('a');

    expect(confirmSpy).toHaveBeenCalledTimes(2);
  });

  it('does not re-ask when the user declines, but keeps the hit', async () => {
    confirmSpy.mockReturnValue(false);
    const deps = makeDeps();
    const h = createPickerHandlers(deps);

    await h.onSelect('a');
    await h.onSelect('a');

    expect(deps.onRemember).not.toHaveBeenCalled();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(deps.onBump).toHaveBeenCalledTimes(2);
  });

  it('ignores a candidate id that is no longer in the list', async () => {
    const deps = makeDeps();
    await createPickerHandlers(deps).onSelect('ghost');

    expect(mocks.fillElement).not.toHaveBeenCalled();
    expect(deps.onBump).not.toHaveBeenCalled();
  });
});

describe('createPickerHandlers / onPinToggle', () => {
  it('pins, then unpins on the second toggle', async () => {
    const deps = makeDeps();
    const h = createPickerHandlers(deps);

    await h.onPinToggle('a');
    expect(deps.onPin).toHaveBeenLastCalledWith('a');
    expect(deps.state.pinnedId).toBe('a');
    expect(deps.refresh).toHaveBeenLastCalledWith({ pinnedId: 'a' });

    await h.onPinToggle('a');
    expect(deps.onPin).toHaveBeenLastCalledWith(null);
    expect(deps.state.pinnedId).toBeNull();
    expect(deps.refresh).toHaveBeenLastCalledWith({ pinnedId: null });
  });

  it('moves the pin to another candidate', async () => {
    const deps = makeDeps();
    const h = createPickerHandlers(deps);

    await h.onPinToggle('a');
    await h.onPinToggle('b');
    expect(deps.state.pinnedId).toBe('b');
  });
});

describe('createPickerHandlers / onDelete', () => {
  it('removes the candidate in place and re-renders', async () => {
    const shared = [mk('a'), mk('b'), mk('c')];
    const deps = makeDeps({ state: { candidates: shared, pinnedId: null } });
    await createPickerHandlers(deps).onDelete('b');

    expect(deps.onDelete).toHaveBeenCalledWith('b');
    // In place: Phase 2's array is shared with the resume object.
    expect(shared.map((c) => c.id)).toEqual(['a', 'c']);
    expect(deps.state.candidates).toBe(shared);
    expect(deps.refresh).toHaveBeenLastCalledWith({ candidates: shared, pinnedId: null });
    expect(deps.retire).not.toHaveBeenCalled();
  });

  it('clears the pin when the pinned candidate is the one deleted', async () => {
    const deps = makeDeps({ state: { candidates: [mk('a'), mk('b'), mk('c')], pinnedId: 'a' } });
    await createPickerHandlers(deps).onDelete('a');

    expect(deps.state.pinnedId).toBeNull();
    expect(deps.refresh).toHaveBeenLastCalledWith({ candidates: deps.state.candidates, pinnedId: null });
  });

  it('keeps an unrelated pin', async () => {
    const deps = makeDeps({ state: { candidates: [mk('a'), mk('b'), mk('c')], pinnedId: 'c' } });
    await createPickerHandlers(deps).onDelete('a');

    expect(deps.state.pinnedId).toBe('c');
  });

  it('retires itself once fewer than two candidates remain', async () => {
    const deps = makeDeps({ state: { candidates: [mk('a'), mk('b')], pinnedId: null } });
    await createPickerHandlers(deps).onDelete('a');

    expect(deps.retire).toHaveBeenCalledTimes(1);
  });

  it('deletes locally only after the store confirms', async () => {
    let resolveDelete: (v: unknown) => void = () => {};
    const onDelete = vi.fn(() => new Promise((r) => { resolveDelete = r; }));
    const deps = makeDeps({ onDelete });
    const p = createPickerHandlers(deps).onDelete('a');

    expect(deps.state.candidates.map((c) => c.id)).toEqual(['a', 'b']);
    resolveDelete(undefined);
    await p;
    expect(deps.state.candidates.map((c) => c.id)).toEqual(['b']);
  });
});

describe('createPickerHandlers / onManageAll', () => {
  it('opens the dashboard at the phase-specific anchor', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const deps = makeDeps({ manageAllHash: '#basic' });

    createPickerHandlers(deps).onManageAll();

    expect(open).toHaveBeenCalledWith('chrome-extension://test/dashboard.html#basic', '_blank');
  });
});
