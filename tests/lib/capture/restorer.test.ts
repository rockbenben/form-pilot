// tests/lib/capture/restorer.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { restoreFields } from '@/lib/capture/restorer';
import type { CapturedField } from '@/lib/capture/types';

beforeEach(() => { document.body.innerHTML = ''; });

describe('restoreFields', () => {
  it('restores text input value and dispatches input/change events', () => {
    document.body.innerHTML = `<input id="n" type="text">`;
    const el = document.getElementById('n') as HTMLInputElement;
    let inputFired = 0, changeFired = 0;
    el.addEventListener('input', () => inputFired++);
    el.addEventListener('change', () => changeFired++);

    const fields: CapturedField[] = [
      { selector: '#n', index: 0, kind: 'text', value: '张三', signature: 's', label: 'n' },
    ];
    const res = restoreFields(document, fields);
    expect(res.restored).toBe(1);
    expect(res.missing).toBe(0);
    expect(res.elements).toEqual([el]);
    expect(el.value).toBe('张三');
    expect(inputFired).toBeGreaterThanOrEqual(1);
    expect(changeFired).toBeGreaterThanOrEqual(1);
    expect(el.getAttribute('data-formpilot-restored')).toBe('draft');
  });

  it('restores textarea and select', () => {
    document.body.innerHTML = `
      <textarea id="t"></textarea>
      <select id="s"><option value="a">A</option><option value="b">B</option></select>
    `;
    restoreFields(document, [
      { selector: '#t', index: 0, kind: 'textarea', value: 'hi', signature: '1', label: 't' },
      { selector: '#s', index: 0, kind: 'select', value: 'b', signature: '2', label: 's' },
    ]);
    expect((document.getElementById('t') as HTMLTextAreaElement).value).toBe('hi');
    expect((document.getElementById('s') as HTMLSelectElement).value).toBe('b');
  });

  it('selects the correct radio by value', () => {
    document.body.innerHTML = `
      <input type="radio" id="r1" name="g" value="a">
      <input type="radio" id="r2" name="g" value="b">
    `;
    restoreFields(document, [
      { selector: '#r2', index: 0, kind: 'radio', value: 'b', signature: 's', label: 'g' },
    ]);
    expect((document.getElementById('r2') as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById('r1') as HTMLInputElement).checked).toBe(false);
  });

  it('restores checkbox boolean state', () => {
    document.body.innerHTML = `
      <input id="a" type="checkbox">
      <input id="b" type="checkbox" checked>
    `;
    restoreFields(document, [
      { selector: '#a', index: 0, kind: 'checkbox', value: 'true', signature: '1', label: 'a' },
      { selector: '#b', index: 0, kind: 'checkbox', value: 'false', signature: '2', label: 'b' },
    ]);
    expect((document.getElementById('a') as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById('b') as HTMLInputElement).checked).toBe(false);
  });

  it('counts missing fields when selector does not match and no signature fallback available', () => {
    document.body.innerHTML = `<input id="other">`;
    const res = restoreFields(document, [
      { selector: '#gone', index: 0, kind: 'text', value: 'x', signature: 'never-matches', label: 'x' },
    ]);
    expect(res.restored).toBe(0);
    expect(res.missing).toBe(1);
  });

  it('restores date inputs via kind=date', () => {
    document.body.innerHTML = `<input id="d" type="date">`;
    const el = document.getElementById('d') as HTMLInputElement;
    restoreFields(document, [
      { selector: '#d', index: 0, kind: 'date', value: '2026-04-19', signature: 's', label: 'd' },
    ]);
    expect(el.value).toBe('2026-04-19');
    expect(el.getAttribute('data-formpilot-restored')).toBe('draft');
  });

  it('restores select by fuzzy text match when value does not match exactly', () => {
    document.body.innerHTML = `
      <select id="s">
        <option value="ft">Full-time</option>
        <option value="pt">Part-time</option>
      </select>
    `;
    restoreFields(document, [
      // Saved value is the option text, not the option value — page may have
      // renamed the value attribute between capture and restore.
      { selector: '#s', index: 0, kind: 'select', value: 'Part-time', signature: 's', label: 's' },
    ]);
    expect((document.getElementById('s') as HTMLSelectElement).value).toBe('pt');
  });

  it('clicks the visible proxy when native radio is display:none (jqradio pattern)', () => {
    document.body.innerHTML = `
      <div class="ui-radio">
        <span class="jqradiowrapper">
          <input type="radio" value="1" id="q20_1" name="q20" style="display:none">
          <a class="jqradio" href="javascript:;"></a>
        </span>
        <div class="label" for="q20_1">是</div>
      </div>
      <div class="ui-radio">
        <span class="jqradiowrapper">
          <input type="radio" value="2" id="q20_2" name="q20" style="display:none">
          <a class="jqradio" href="javascript:;"></a>
        </span>
        <div class="label" for="q20_2">否</div>
      </div>
    `;
    let proxyClicks = 0;
    document.querySelectorAll('a.jqradio').forEach((a) => {
      a.addEventListener('click', () => { proxyClicks++; });
    });

    restoreFields(document, [
      { selector: '#q20_1', index: 0, kind: 'radio', value: '1', signature: 's', label: 'q20' },
    ]);

    expect((document.getElementById('q20_1') as HTMLInputElement).checked).toBe(true);
    expect(proxyClicks).toBe(1); // the <a> adjacent to q20_1 got .click()
  });

  it('restores a contenteditable element and dispatches input event', () => {
    document.body.innerHTML = `<div id="c" contenteditable="true"></div>`;
    const el = document.getElementById('c') as HTMLElement;
    let inputFired = 0;
    el.addEventListener('input', () => inputFired++);
    restoreFields(document, [
      { selector: '#c', index: 0, kind: 'contenteditable', value: 'restored text', signature: 's', label: 'Comment' },
    ]);
    expect(el.textContent).toBe('restored text');
    expect(inputFired).toBeGreaterThanOrEqual(1);
    expect(el.getAttribute('data-formpilot-restored')).toBe('draft');
  });

  it('restores a <select multiple> to all the captured options', () => {
    document.body.innerHTML = `
      <select id="s" multiple>
        <option value="zh">中文</option>
        <option value="en">English</option>
        <option value="ja">日本語</option>
      </select>
    `;
    const el = document.getElementById('s') as HTMLSelectElement;
    restoreFields(document, [
      {
        selector: '#s', index: 0, kind: 'select',
        // Stored value: unit-separator-joined option values
        value: 'zh\u001fja', signature: 's', label: 'Languages',
      },
    ]);
    const selected = Array.from(el.options).filter((o) => o.selected).map((o) => o.value);
    expect(selected.sort()).toEqual(['ja', 'zh']);
  });

  it('restores radio via group fallback when resolved target has wrong value', () => {
    document.body.innerHTML = `
      <input type="radio" id="g1" name="g" value="a">
      <input type="radio" id="g2" name="g" value="b">
      <input type="radio" id="g3" name="g" value="c">
    `;
    // Field was saved with selector=#g1 (the checked radio at capture time),
    // but value='c'. The resolved target #g1's value is 'a' — we should walk
    // the group and find #g3 whose value matches.
    restoreFields(document, [
      { selector: '#g1', index: 0, kind: 'radio', value: 'c', signature: 's', label: 'g' },
    ]);
    expect((document.getElementById('g1') as HTMLInputElement).checked).toBe(false);
    expect((document.getElementById('g3') as HTMLInputElement).checked).toBe(true);
    expect(document.getElementById('g3')?.getAttribute('data-formpilot-restored')).toBe('draft');
  });

  it('falls back to (signature, index) when selector does not match', () => {
    document.body.innerHTML = `
      <label>Email</label><input data-sig="email-sig" value="">
      <label>Email</label><input data-sig="email-sig" value="">
    `;
    const res = restoreFields(
      document,
      [
        { selector: '#old-that-is-gone', index: 1, kind: 'text', value: 'hit', signature: 'email-sig', label: 'Email' },
      ],
      {
        sigMatcher: (el: Element) => el.getAttribute('data-sig') ?? '',
      },
    );
    expect(res.restored).toBe(1);
    const inputs = document.querySelectorAll('input');
    expect((inputs[0] as HTMLInputElement).value).toBe('');
    expect((inputs[1] as HTMLInputElement).value).toBe('hit');
  });
});
