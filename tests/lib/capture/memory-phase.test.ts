// tests/lib/capture/memory-phase.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { runMemoryPhase } from '@/lib/capture/memory-phase';
import { computeSignatureFor } from '@/lib/capture/signature';
import type { PageMemoryEntry } from '@/lib/capture/types';
import type { ScannedItem } from '@/lib/engine/scanner';

beforeEach(() => { document.body.innerHTML = ''; });

function item(el: Element, status: 'recognized' | 'unrecognized' = 'unrecognized'): ScannedItem {
  return {
    element: el,
    resumePath: status === 'recognized' ? 'basic.name' : '',
    label: 'x',
    inputType: 'text',
    confidence: 0,
    source: 'heuristic',
    status,
  };
}

describe('runMemoryPhase', () => {
  it('fills unrecognized input matching signature', async () => {
    document.body.innerHTML = `
      <label>Why us?</label><input id="q" name="whyUs" type="text">
    `;
    const el = document.getElementById('q')!;
    const sig = computeSignatureFor(el);
    const entries: PageMemoryEntry[] = [
      { signature: sig, index: 0, kind: 'text', value: 'I love it', updatedAt: Date.now() },
    ];
    const items: ScannedItem[] = [item(el, 'unrecognized')];
    const filled = await runMemoryPhase(document, items, entries);
    expect(filled).toBe(1);
    expect((el as HTMLInputElement).value).toBe('I love it');
  });

  it('does not touch recognized items', async () => {
    document.body.innerHTML = `<input id="q" value="pre">`;
    const el = document.getElementById('q')!;
    const sig = computeSignatureFor(el);
    const entries: PageMemoryEntry[] = [
      { signature: sig, index: 0, kind: 'text', value: 'override', updatedAt: Date.now() },
    ];
    const items: ScannedItem[] = [item(el, 'recognized')];
    const filled = await runMemoryPhase(document, items, entries);
    expect(filled).toBe(0);
    expect((el as HTMLInputElement).value).toBe('pre');
  });

  it('matches by (signature, index) for duplicate-signature fields', async () => {
    document.body.innerHTML = `
      <label>Ref</label><input id="r1" name="ref" type="text">
      <label>Ref</label><input id="r2" name="ref" type="text">
    `;
    const r1 = document.getElementById('r1')!;
    const r2 = document.getElementById('r2')!;
    const sig = computeSignatureFor(r1);
    const entries: PageMemoryEntry[] = [
      { signature: sig, index: 0, kind: 'text', value: 'first', updatedAt: 0 },
      { signature: sig, index: 1, kind: 'text', value: 'second', updatedAt: 0 },
    ];
    const items: ScannedItem[] = [item(r1, 'unrecognized'), item(r2, 'unrecognized')];
    await runMemoryPhase(document, items, entries);
    expect((r1 as HTMLInputElement).value).toBe('first');
    expect((r2 as HTMLInputElement).value).toBe('second');
  });

  it('marks filled items with source=memory', async () => {
    document.body.innerHTML = `<label>Q</label><input id="q" name="q">`;
    const el = document.getElementById('q')!;
    const entries: PageMemoryEntry[] = [
      { signature: computeSignatureFor(el), index: 0, kind: 'text', value: 'a', updatedAt: 0 },
    ];
    const items: ScannedItem[] = [item(el, 'unrecognized')];
    await runMemoryPhase(document, items, entries);
    expect(items[0].source).toBe('memory' as unknown as ScannedItem['source']);
  });

  it('skips elements flagged data-formpilot-restored=draft', async () => {
    document.body.innerHTML = `<label>Q</label><input id="q" name="q" value="user draft">`;
    const el = document.getElementById('q') as HTMLInputElement;
    el.setAttribute('data-formpilot-restored', 'draft');
    const entries: PageMemoryEntry[] = [
      { signature: computeSignatureFor(el), index: 0, kind: 'text', value: 'memory override', updatedAt: 0 },
    ];
    const items: ScannedItem[] = [item(el, 'unrecognized')];
    const filled = await runMemoryPhase(document, items, entries);
    expect(filled).toBe(0);
    expect(el.value).toBe('user draft');
    expect(items[0].source).toBe('heuristic'); // unchanged
  });
});
