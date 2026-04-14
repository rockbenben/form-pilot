import { describe, it, expect, afterEach } from 'vitest';
import { matchField, scanForm } from '@/lib/engine/heuristic/engine';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('matchField', () => {
  it('matches email by name attribute with confidence >= 0.9', () => {
    const el = document.createElement('input');
    el.setAttribute('name', 'email');
    el.setAttribute('type', 'text');
    const mapping = matchField(el);
    expect(mapping).not.toBeNull();
    expect(mapping!.resumePath).toBe('basic.email');
    expect(mapping!.confidence).toBeGreaterThanOrEqual(0.9);
    expect(mapping!.source).toBe('heuristic');
  });

  it('matches name by label text', () => {
    document.body.innerHTML = `
      <label for="applicant-name">姓名</label>
      <input id="applicant-name" type="text" />
    `;
    const el = document.body.querySelector('input') as HTMLInputElement;
    const mapping = matchField(el);
    expect(mapping).not.toBeNull();
    expect(mapping!.resumePath).toBe('basic.name');
  });

  it('matches phone by placeholder', () => {
    const el = document.createElement('input');
    el.setAttribute('placeholder', '请输入手机号');
    const mapping = matchField(el);
    expect(mapping).not.toBeNull();
    expect(mapping!.resumePath).toBe('basic.phone');
  });

  it('returns null for unrecognized fields', () => {
    const el = document.createElement('input');
    el.setAttribute('name', 'xyzunknownfield123');
    const mapping = matchField(el);
    expect(mapping).toBeNull();
  });

  it('uses highest confidence signal when multiple signals match', () => {
    // name attribute has weight 0.95, placeholder has weight 0.8
    // Both match email — the name attr should drive confidence
    const el = document.createElement('input');
    el.setAttribute('name', 'email');
    el.setAttribute('placeholder', '请输入邮箱地址');
    const mapping = matchField(el);
    expect(mapping).not.toBeNull();
    expect(mapping!.resumePath).toBe('basic.email');
    // The confidence should reflect the highest-weight signal (nameAttr = 0.95)
    expect(mapping!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('matches education school by name attribute', () => {
    const el = document.createElement('input');
    el.setAttribute('name', 'school');
    const mapping = matchField(el);
    expect(mapping).not.toBeNull();
    expect(mapping!.resumePath).toBe('education.school');
  });

  it('matches work company by label text', () => {
    document.body.innerHTML = `
      <label for="comp">公司名称</label>
      <input id="comp" type="text" />
    `;
    const el = document.body.querySelector('input') as HTMLInputElement;
    const mapping = matchField(el);
    expect(mapping).not.toBeNull();
    expect(mapping!.resumePath).toBe('work.company');
  });

  it('sets inputType correctly in mapping', () => {
    const el = document.createElement('select');
    el.setAttribute('name', 'degree');
    const mapping = matchField(el);
    expect(mapping).not.toBeNull();
    expect(mapping!.inputType).toBe('select');
  });
});

describe('scanForm', () => {
  it('returns multiple mappings for a form with multiple matching fields', () => {
    document.body.innerHTML = `
      <form>
        <input name="email" type="text" />
        <input name="phone" type="tel" />
        <input name="xyzunknown" type="text" />
      </form>
    `;
    const form = document.body.querySelector('form') as HTMLFormElement;
    const mappings = scanForm(form);
    expect(mappings.length).toBeGreaterThanOrEqual(2);
    const paths = mappings.map((m) => m.resumePath);
    expect(paths).toContain('basic.email');
    expect(paths).toContain('basic.phone');
  });

  it('returns empty array for form with no recognizable fields', () => {
    document.body.innerHTML = `
      <form>
        <input name="xyzfoo" type="text" />
        <input name="abcbar" type="text" />
      </form>
    `;
    const form = document.body.querySelector('form') as HTMLFormElement;
    const mappings = scanForm(form);
    expect(mappings).toHaveLength(0);
  });
});
