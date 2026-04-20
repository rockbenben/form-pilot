// tests/lib/capture/serializer.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { serializeFields } from '@/lib/capture/serializer';
import { MAX_FIELD_SIZE, MAX_TOTAL_SIZE } from '@/lib/capture/sensitive';

beforeEach(() => { document.body.innerHTML = ''; });

describe('serializeFields', () => {
  it('serializes text input with label', () => {
    document.body.innerHTML = `
      <label for="n">Name</label>
      <input id="n" name="name" type="text" value="张三">
    `;
    const { fields, skipped } = serializeFields(document, { skipSensitive: true });
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      kind: 'text',
      value: '张三',
      label: 'Name',
    });
    expect(fields[0].selector).toBe('#n');
    expect(skipped).toBe(0);
  });

  it('serializes date/datetime-local/month inputs with kind=date', () => {
    document.body.innerHTML = `
      <label for="bd">Birthday</label><input id="bd" type="date" value="1990-01-15">
      <label for="dt">Meet</label><input id="dt" type="datetime-local" value="2026-04-19T10:30">
      <label for="mo">Month</label><input id="mo" type="month" value="2024-03">
    `;
    const { fields } = serializeFields(document, { skipSensitive: true });
    expect(fields).toHaveLength(3);
    for (const f of fields) {
      expect(f.kind).toBe('date');
    }
    expect(fields.map((f) => f.value).sort()).toEqual([
      '1990-01-15', '2024-03', '2026-04-19T10:30',
    ].sort());
  });

  it('serializes textarea, select, and checkbox', () => {
    document.body.innerHTML = `
      <textarea id="bio">hi</textarea>
      <select id="color"><option value="red" selected>Red</option><option value="blue">Blue</option></select>
      <input id="agree" type="checkbox" checked>
    `;
    const { fields } = serializeFields(document, { skipSensitive: true });
    const byKind = Object.fromEntries(fields.map((f) => [f.kind, f]));
    expect(byKind.textarea.value).toBe('hi');
    expect(byKind.select.value).toBe('red');
    expect(byKind.checkbox.value).toBe('true');
  });

  it('keeps only the selected radio within a group', () => {
    document.body.innerHTML = `
      <input type="radio" name="g" value="a">
      <input type="radio" name="g" value="b" checked>
      <input type="radio" name="g" value="c">
    `;
    const { fields } = serializeFields(document, { skipSensitive: true });
    expect(fields).toHaveLength(1);
    expect(fields[0].kind).toBe('radio');
    expect(fields[0].value).toBe('b');
  });

  it('assigns increasing index to fields sharing a signature', () => {
    document.body.innerHTML = `
      <label>Email</label><input name="email1" type="email" value="a@a">
      <label>Email</label><input name="email2" type="email" value="b@b">
    `;
    const { fields } = serializeFields(document, { skipSensitive: true });
    expect(fields).toHaveLength(2);
    const emails = fields.filter((f) => f.label === 'Email');
    expect(emails).toHaveLength(2);
    expect(emails.map((f) => f.index).sort()).toEqual([0, 1]);
    expect(emails[0].signature).toBe(emails[1].signature);
  });

  it('skips password, hidden, file, submit, reset, button inputs', () => {
    document.body.innerHTML = `
      <input type="password" value="secret">
      <input type="hidden" value="x">
      <input type="file">
      <input type="submit" value="Go">
      <input type="reset" value="Reset">
      <input type="button" value="Btn">
    `;
    const { fields } = serializeFields(document, { skipSensitive: true });
    expect(fields).toEqual([]);
  });

  it('skips disabled but captures readOnly (widget-controlled values)', () => {
    document.body.innerHTML = `
      <input name="a" readonly value="x">
      <input name="b" disabled value="y">
    `;
    const { fields } = serializeFields(document, { skipSensitive: true });
    expect(fields.map((f) => f.value)).toEqual(['x']);
  });

  it('finds label for radio via group heading (preceding sibling)', () => {
    document.body.innerHTML = `
      <div class="div_title">性别</div>
      <div class="ui-controlgroup">
        <div class="ui-radio">
          <input type="radio" name="q3" value="1" id="q3_1" checked>
          <div class="label" for="q3_1">男</div>
        </div>
        <div class="ui-radio">
          <input type="radio" name="q3" value="2" id="q3_2">
          <div class="label" for="q3_2">女</div>
        </div>
      </div>
    `;
    const { fields } = serializeFields(document, { skipSensitive: true });
    expect(fields).toHaveLength(1);
    expect(fields[0].kind).toBe('radio');
    expect(fields[0].label).toBe('性别');
    expect(fields[0].value).toBe('1');
  });

  it('picks up group heading when second radio in group is the checked one', () => {
    document.body.innerHTML = `
      <div class="div_title">性别</div>
      <div class="ui-controlgroup">
        <div class="ui-radio">
          <input type="radio" name="q3" value="1" id="q3_1">
          <div class="label" for="q3_1">男</div>
        </div>
        <div class="ui-radio">
          <input type="radio" name="q3" value="2" id="q3_2" checked>
          <div class="label" for="q3_2">女</div>
        </div>
      </div>
    `;
    const { fields } = serializeFields(document, { skipSensitive: true });
    // Without the fix, the group-heading walk would return "男" (previous
    // radio's option text) instead of walking up to find "性别".
    expect(fields[0].label).toBe('性别');
  });

  it('captures a contenteditable region as kind=contenteditable', () => {
    document.body.innerHTML = `
      <label>Comment</label>
      <div id="c" contenteditable="true">Hello world</div>
    `;
    const { fields } = serializeFields(document, { skipSensitive: true });
    expect(fields).toHaveLength(1);
    expect(fields[0].kind).toBe('contenteditable');
    expect(fields[0].value).toBe('Hello world');
  });

  it('captures all selected options for <select multiple>', () => {
    document.body.innerHTML = `
      <label for="s">Languages</label>
      <select id="s" multiple>
        <option value="zh" selected>中文</option>
        <option value="en" selected>English</option>
        <option value="ja">日本語</option>
      </select>
    `;
    const { fields } = serializeFields(document, { skipSensitive: true });
    expect(fields).toHaveLength(1);
    expect(fields[0].kind).toBe('select');
    // Both selected values should round-trip; separator is the unit separator
    const vals = fields[0].value.split('\u001f');
    expect(vals.sort()).toEqual(['en', 'zh']);
  });

  it('finds label as immediate preceding sibling (question-title pattern)', () => {
    document.body.innerHTML = `
      <div class="form">
        <div class="div_title">年龄</div>
        <input id="age" name="age" type="number">
      </div>
    `;
    const { fields } = serializeFields(document, { skipSensitive: true });
    expect(fields).toHaveLength(1);
    expect(fields[0].label).toBe('年龄');
  });

  it('skips sensitive labels when skipSensitive=true', () => {
    document.body.innerHTML = `
      <label for="id">身份证号</label>
      <input id="id" name="idCard" value="123">
    `;
    const { fields, skipped } = serializeFields(document, { skipSensitive: true });
    expect(fields).toEqual([]);
    expect(skipped).toBeGreaterThanOrEqual(1);
  });

  it('does not skip sensitive labels when skipSensitive=false', () => {
    document.body.innerHTML = `
      <label for="id">身份证号</label>
      <input id="id" name="idCard" value="123">
    `;
    const { fields } = serializeFields(document, { skipSensitive: false });
    expect(fields).toHaveLength(1);
    expect(fields[0].value).toBe('123');
  });

  it('skips individual fields larger than MAX_FIELD_SIZE', () => {
    const big = 'x'.repeat(MAX_FIELD_SIZE + 1);
    const small = 'ok';
    document.body.innerHTML = `
      <textarea id="big">${big}</textarea>
      <input id="small" value="${small}">
    `;
    const { fields, skipped } = serializeFields(document, { skipSensitive: true });
    expect(fields).toHaveLength(1);
    expect(fields[0].value).toBe(small);
    expect(skipped).toBeGreaterThanOrEqual(1);
  });

  it('truncates total payload above MAX_TOTAL_SIZE by dropping largest fields first', () => {
    const chunk = 'y'.repeat(49 * 1024);
    let html = '';
    for (let i = 0; i < 12; i++) html += `<textarea id="t${i}">${chunk}</textarea>`;
    document.body.innerHTML = html;
    const { fields } = serializeFields(document, { skipSensitive: true });
    const total = fields.reduce((sum, f) => sum + f.value.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_SIZE);
    expect(fields.length).toBeLessThan(12);
  });
});
