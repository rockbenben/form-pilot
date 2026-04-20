import { describe, it, expect, beforeEach } from 'vitest';
import { runFormPhase } from '@/lib/capture/form-phase';
import { computeSignatureFor } from '@/lib/capture/signature';
import type { FormEntry } from '@/lib/storage/form-store';
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

describe('runFormPhase', () => {
  it('fills a text input when a cross-URL form entry matches by signature', async () => {
    document.body.innerHTML = `
      <label for="q">姓名</label>
      <input id="q" name="q">
    `;
    const el = document.getElementById('q')!;
    const sig = computeSignatureFor(el);
    const entries: Record<string, FormEntry> = {
      [sig]: {
        signature: sig, kind: 'text', value: '张三', label: '姓名',
        lastUrl: 'https://elsewhere.com/', updatedAt: 0, hitCount: 3,
      },
    };
    const items = [item(el)];
    const filled = await runFormPhase(document, items, entries);
    expect(filled).toBe(1);
    expect((el as HTMLInputElement).value).toBe('张三');
    expect(items[0].source).toBe('form' as unknown as ScannedItem['source']);
  });

  it('prefers displayValue for radio so option text drives cross-URL matching', async () => {
    // Source site had value='1' for 男. Destination site uses value='male'.
    // Signature matches (both labels are "性别"). displayValue='男' should
    // resolve to the correct radio via fillRadio's label-text fallback.
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
    const entries: Record<string, FormEntry> = {
      [sig]: {
        signature: sig, kind: 'radio',
        value: '1',               // source site's internal value
        displayValue: '男',        // the visible option text
        label: '性别',
        lastUrl: 'https://wjx.top/', updatedAt: 0, hitCount: 1,
      },
    };
    const items = [
      item(radio),
      item(document.getElementById('f')!),
    ];
    const filled = await runFormPhase(document, items, entries);
    expect(filled).toBe(1);
    expect((document.getElementById('m') as HTMLInputElement).checked).toBe(true);
  });

  it('skips items already flagged as draft-restored', async () => {
    document.body.innerHTML = `<label for="q">Q</label><input id="q" value="user draft">`;
    const el = document.getElementById('q') as HTMLInputElement;
    el.setAttribute('data-formpilot-restored', 'draft');
    const sig = computeSignatureFor(el);
    const entries: Record<string, FormEntry> = {
      [sig]: { signature: sig, kind: 'text', value: 'from-form', label: 'Q', lastUrl: '', updatedAt: 0, hitCount: 1 },
    };
    const filled = await runFormPhase(document, [item(el)], entries);
    expect(filled).toBe(0);
    expect(el.value).toBe('user draft');
  });

  it('skips recognized items', async () => {
    document.body.innerHTML = `<input id="q" value="">`;
    const el = document.getElementById('q') as HTMLInputElement;
    const sig = computeSignatureFor(el);
    const scanned = item(el);
    scanned.status = 'recognized';
    const entries: Record<string, FormEntry> = {
      [sig]: { signature: sig, kind: 'text', value: 'x', label: 'q', lastUrl: '', updatedAt: 0, hitCount: 1 },
    };
    const filled = await runFormPhase(document, [scanned], entries);
    expect(filled).toBe(0);
    expect(el.value).toBe('');
  });
});
