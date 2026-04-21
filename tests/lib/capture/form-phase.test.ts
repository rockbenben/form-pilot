import { describe, it, expect, beforeEach } from 'vitest';
import { runFormPhase } from '@/lib/capture/form-phase';
import { computeSignatureFor } from '@/lib/capture/signature';
import type { FormEntriesMap, FieldCandidate, FormEntry } from '@/lib/storage/form-store';
import type { CapturedFieldKind } from '@/lib/capture/types';
import type { ScannedItem } from '@/lib/engine/scanner';

beforeEach(() => { document.body.innerHTML = ''; });

function item(el: Element): ScannedItem {
  return {
    element: el,
    resumePath: '',
    label: 'x',
    inputType: 'text',
    confidence: 0,
    source: 'heuristic',
    status: 'unrecognized',
  };
}

function mkEntry(
  sig: string,
  kind: CapturedFieldKind,
  candidates: Partial<FieldCandidate>[],
  pinnedId: string | null = null,
): FormEntry {
  return {
    signature: sig,
    kind,
    label: sig,
    pinnedId,
    candidates: candidates.map((c, i) => ({
      id: c.id ?? `${sig}-c${i}`,
      value: c.value ?? '',
      displayValue: c.displayValue,
      hitCount: c.hitCount ?? 1,
      createdAt: c.createdAt ?? 0,
      updatedAt: c.updatedAt ?? 0,
      lastUrl: c.lastUrl ?? '',
    })),
  };
}

describe('runFormPhase', () => {
  it('fills a text input when a cross-URL form entry matches by signature', async () => {
    document.body.innerHTML = `
      <label for="q">姓名</label>
      <input id="q" name="q">
    `;
    const el = document.getElementById('q')!;
    const sig = computeSignatureFor(el);
    const entries: FormEntriesMap = {
      [sig]: mkEntry(sig, 'text', [
        { id: 'c1', value: '张三', hitCount: 3 },
      ]),
    };
    const items = [item(el)];
    const result = await runFormPhase(document, items, entries, {}, '');
    expect(result.filled).toBe(1);
    expect((el as HTMLInputElement).value).toBe('张三');
    expect(items[0].source).toBe('form' as unknown as ScannedItem['source']);
    expect(result.hits).toEqual([{ signature: sig, candidateId: 'c1' }]);
  });

  it('prefers displayValue for radio so option text drives cross-URL matching', async () => {
    document.body.innerHTML = `
      <div>性别</div>
      <div>
        <input type="radio" name="g" value="male" id="m">
        <label for="m">男</label>
      </div>
      <div>
        <input type="radio" name="g" value="female" id="f">
        <label for="f">女</label>
      </div>
    `;
    const radio = document.getElementById('m') as HTMLInputElement;
    const sig = computeSignatureFor(radio);
    const entries: FormEntriesMap = {
      [sig]: mkEntry(sig, 'radio', [
        { id: 'rc', value: '1', displayValue: '男' },
      ]),
    };
    const items = [
      item(radio),
      item(document.getElementById('f')!),
    ];
    const result = await runFormPhase(document, items, entries, {}, '');
    expect(result.filled).toBe(1);
    expect((document.getElementById('m') as HTMLInputElement).checked).toBe(true);
  });

  it('skips items already flagged as draft-restored', async () => {
    document.body.innerHTML = `<label for="q">Q</label><input id="q" value="user draft">`;
    const el = document.getElementById('q') as HTMLInputElement;
    el.setAttribute('data-formpilot-restored', 'draft');
    const sig = computeSignatureFor(el);
    const entries: FormEntriesMap = {
      [sig]: mkEntry(sig, 'text', [{ value: 'from-form' }]),
    };
    const result = await runFormPhase(document, [item(el)], entries, {}, '');
    expect(result.filled).toBe(0);
    expect(el.value).toBe('user draft');
  });

  it('skips recognized items', async () => {
    document.body.innerHTML = `<input id="q" value="">`;
    const el = document.getElementById('q') as HTMLInputElement;
    const sig = computeSignatureFor(el);
    const scanned = item(el);
    scanned.status = 'recognized';
    const entries: FormEntriesMap = {
      [sig]: mkEntry(sig, 'text', [{ value: 'x' }]),
    };
    const result = await runFormPhase(document, [scanned], entries, {}, '');
    expect(result.filled).toBe(0);
    expect(el.value).toBe('');
  });

  it('prefers the domain-pref candidate over the highest-hitCount one', async () => {
    document.body.innerHTML = `<label for="e1">Email</label><input id="e1">`;
    const el = document.querySelector<HTMLInputElement>('#e1')!;
    const sig = computeSignatureFor(el);
    const entries: FormEntriesMap = {
      [sig]: mkEntry(sig, 'text', [
        { id: 'strong', value: 'strong@x.com', hitCount: 10 },
        { id: 'prefer', value: 'prefer@y.com', hitCount: 1 },
      ]),
    };
    const result = await runFormPhase(
      document,
      [item(el)],
      entries,
      { [sig]: { 'workday.com': 'prefer' } },
      'workday.com',
    );
    expect(result.filled).toBe(1);
    expect(el.value).toBe('prefer@y.com');
    expect(result.hits).toEqual([{ signature: sig, candidateId: 'prefer' }]);
  });
});
