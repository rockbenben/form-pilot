import { describe, it, expect, afterEach } from 'vitest';
import { extractSignals } from '@/lib/engine/heuristic/signals';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('extractSignals', () => {
  it('extracts name and id attributes', () => {
    const el = document.createElement('input');
    el.setAttribute('name', 'email');
    el.setAttribute('id', 'user-email');
    const signals = extractSignals(el);
    expect(signals.nameAttr).toBe('email');
    expect(signals.idAttr).toBe('user-email');
  });

  it('extracts placeholder text', () => {
    const el = document.createElement('input');
    el.setAttribute('placeholder', '请输入邮箱');
    const signals = extractSignals(el);
    expect(signals.placeholder).toBe('请输入邮箱');
  });

  it('extracts label via for attribute', () => {
    document.body.innerHTML = `
      <label for="name-field">姓名</label>
      <input id="name-field" type="text" />
    `;
    const el = document.body.querySelector('input') as HTMLInputElement;
    const signals = extractSignals(el);
    expect(signals.labelText).toBe('姓名');
  });

  it('extracts label from wrapping label element', () => {
    document.body.innerHTML = `
      <label>
        Phone Number
        <input type="tel" />
      </label>
    `;
    const el = document.body.querySelector('input') as HTMLInputElement;
    const signals = extractSignals(el);
    expect(signals.labelText).toContain('Phone Number');
  });

  it('extracts aria-label', () => {
    const el = document.createElement('input');
    el.setAttribute('aria-label', 'Full Name');
    const signals = extractSignals(el);
    expect(signals.ariaLabel).toBe('Full Name');
  });

  it('extracts title attribute', () => {
    const el = document.createElement('input');
    el.setAttribute('title', 'Enter your phone');
    const signals = extractSignals(el);
    expect(signals.title).toBe('Enter your phone');
  });

  it('extracts surrounding text from previous sibling', () => {
    document.body.innerHTML = `
      <span>工作单位</span>
      <input type="text" />
    `;
    const el = document.body.querySelector('input') as HTMLInputElement;
    const signals = extractSignals(el);
    expect(signals.surroundingText).toBe('工作单位');
  });

  it('detects select input type', () => {
    const el = document.createElement('select');
    const signals = extractSignals(el);
    expect(signals.inputType).toBe('select');
  });

  it('detects textarea input type', () => {
    const el = document.createElement('textarea');
    const signals = extractSignals(el);
    expect(signals.inputType).toBe('textarea');
  });

  it('detects date input type', () => {
    const el = document.createElement('input');
    el.setAttribute('type', 'date');
    const signals = extractSignals(el);
    expect(signals.inputType).toBe('date');
  });

  it('detects radio input type', () => {
    const el = document.createElement('input');
    el.setAttribute('type', 'radio');
    const signals = extractSignals(el);
    expect(signals.inputType).toBe('radio');
  });

  it('detects checkbox input type', () => {
    const el = document.createElement('input');
    el.setAttribute('type', 'checkbox');
    const signals = extractSignals(el);
    expect(signals.inputType).toBe('checkbox');
  });

  it('defaults to text input type for unknown', () => {
    const el = document.createElement('input');
    const signals = extractSignals(el);
    expect(signals.inputType).toBe('text');
  });
});
