import { describe, it, expect, afterEach, vi } from 'vitest';
import { fillElement } from '@/lib/engine/heuristic/fillers';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('fillElement', () => {
  it('fills text input and dispatches events', async () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);

    const events: string[] = [];
    input.addEventListener('focus', () => events.push('focus'));
    input.addEventListener('input', () => events.push('input'));
    input.addEventListener('change', () => events.push('change'));
    input.addEventListener('blur', () => events.push('blur'));

    const result = await fillElement(input, 'test@example.com', 'text');
    expect(result).toBe(true);
    expect(input.value).toBe('test@example.com');
    expect(events).toContain('input');
    expect(events).toContain('change');
  });

  it('selects exact matching option in select element', async () => {
    document.body.innerHTML = `
      <select>
        <option value="">请选择</option>
        <option value="bachelor">本科</option>
        <option value="master">硕士</option>
        <option value="phd">博士</option>
      </select>
    `;
    const select = document.body.querySelector('select') as HTMLSelectElement;
    const result = await fillElement(select, '硕士', 'select');
    expect(result).toBe(true);
    expect(select.value).toBe('master');
  });

  it('fuzzy-matches select options by substring', async () => {
    document.body.innerHTML = `
      <select>
        <option value="">请选择</option>
        <option value="full">全职 Full-time</option>
        <option value="part">兼职 Part-time</option>
      </select>
    `;
    const select = document.body.querySelector('select') as HTMLSelectElement;
    const result = await fillElement(select, 'Full-time', 'select');
    expect(result).toBe(true);
    expect(select.value).toBe('full');
  });

  it('checks radio button by label text match', async () => {
    document.body.innerHTML = `
      <label><input type="radio" name="gender" value="male" />男</label>
      <label><input type="radio" name="gender" value="female" />女</label>
    `;
    const radios = document.body.querySelectorAll('input[type="radio"]');
    const firstRadio = radios[0] as HTMLInputElement;
    const result = await fillElement(firstRadio, '男', 'radio');
    expect(result).toBe(true);
    // The radio for "男" should be checked
    const maleRadio = document.body.querySelector(
      'input[value="male"]'
    ) as HTMLInputElement;
    expect(maleRadio.checked).toBe(true);
  });

  it('checks radio button by value match', async () => {
    document.body.innerHTML = `
      <input type="radio" name="gender" value="male" />
      <input type="radio" name="gender" value="female" />
    `;
    const firstRadio = document.body.querySelector(
      'input[type="radio"]'
    ) as HTMLInputElement;
    const result = await fillElement(firstRadio, 'female', 'radio');
    expect(result).toBe(true);
    const femaleRadio = document.body.querySelector(
      'input[value="female"]'
    ) as HTMLInputElement;
    expect(femaleRadio.checked).toBe(true);
  });

  it('fills textarea and dispatches events', async () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    const events: string[] = [];
    textarea.addEventListener('input', () => events.push('input'));
    textarea.addEventListener('change', () => events.push('change'));

    const result = await fillElement(textarea, '这是一段工作描述', 'textarea');
    expect(result).toBe(true);
    expect(textarea.value).toBe('这是一段工作描述');
    expect(events).toContain('input');
  });

  it('returns false for empty value', async () => {
    const input = document.createElement('input');
    input.type = 'text';
    const result = await fillElement(input, '', 'text');
    expect(result).toBe(false);
  });

  it('fills checkbox when value is truthy string', async () => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    document.body.appendChild(checkbox);

    const result = await fillElement(checkbox, 'true', 'checkbox');
    expect(result).toBe(true);
    expect(checkbox.checked).toBe(true);
  });

  it('unchecks checkbox when value is falsy string', async () => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    document.body.appendChild(checkbox);

    const result = await fillElement(checkbox, 'false', 'checkbox');
    expect(result).toBe(true);
    expect(checkbox.checked).toBe(false);
  });

  it('fills date input', async () => {
    const input = document.createElement('input');
    input.type = 'date';
    document.body.appendChild(input);

    const result = await fillElement(input, '2024-01-15', 'date');
    expect(result).toBe(true);
    expect(input.value).toBe('2024-01-15');
  });
});
