// tests/lib/capture/writeback.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { collectWriteBack, applyWriteback } from '@/lib/capture/writeback';
import { createEmptyResume } from '@/lib/storage/types';
import type { ScannedItem } from '@/lib/engine/scanner';

beforeEach(() => { document.body.innerHTML = ''; });

function item(
  partial: Partial<ScannedItem> & { element: Element; resumePath: string },
): ScannedItem {
  return {
    label: partial.resumePath,
    inputType: 'text',
    confidence: 0.9,
    source: 'heuristic',
    status: 'recognized',
    ...partial,
  } as ScannedItem;
}

describe('collectWriteBack', () => {
  it('aggregates page values by resumePath, last non-empty wins', () => {
    document.body.innerHTML = `
      <input id="e1" value="a@x.com">
      <input id="e2" value="b@y.com">
    `;
    const e1 = document.getElementById('e1')!;
    const e2 = document.getElementById('e2')!;
    const items = [
      item({ element: e1, resumePath: 'basic.email' }),
      item({ element: e2, resumePath: 'basic.email' }),
    ];
    const pairs = collectWriteBack(items);
    expect(pairs).toEqual([{ resumePath: 'basic.email', value: 'b@y.com' }]);
  });

  it('ignores unrecognized and empty-valued items', () => {
    document.body.innerHTML = `<input id="x" value="hi"><input id="y" value="">`;
    const x = document.getElementById('x')!;
    const y = document.getElementById('y')!;
    const items = [
      item({ element: x, resumePath: '', status: 'unrecognized' }),
      item({ element: y, resumePath: 'basic.name' }),
    ];
    expect(collectWriteBack(items)).toEqual([]);
  });

  it('handles checkboxes and selects', () => {
    document.body.innerHTML = `
      <input id="c" type="checkbox" checked>
      <select id="s"><option value="red" selected>Red</option></select>
    `;
    const c = document.getElementById('c')!;
    const s = document.getElementById('s')!;
    const pairs = collectWriteBack([
      item({ element: c, resumePath: 'custom.agree' }),
      item({ element: s, resumePath: 'basic.gender' }),
    ]);
    const byPath = Object.fromEntries(pairs.map((p) => [p.resumePath, p.value]));
    expect(byPath['custom.agree']).toBe('true');
    expect(byPath['basic.gender']).toBe('red');
  });
});

describe('applyWriteback', () => {
  it('writes scalar basic fields', () => {
    const resume = createEmptyResume('id', 'name');
    const updated = applyWriteback(resume, [
      { resumePath: 'basic.name', value: '李四' },
      { resumePath: 'basic.gender', value: '男' },
    ]);
    // NOTE: basic.email/phone are now FieldCandidate[]; writeback for those
    // paths is handled by Task 7. This test only covers plain string fields.
    expect(updated.basic.name).toBe('李四');
    expect(updated.basic.gender).toBe('男');
  });

  it('writes indexed array fields, growing the array', () => {
    const resume = createEmptyResume('id', 'name');
    const updated = applyWriteback(resume, [
      { resumePath: 'education[1].school', value: '清华' },
    ]);
    expect(updated.education).toHaveLength(2);
    expect(updated.education[1].school).toBe('清华');
  });

  it('writes unindexed array path to index 0', () => {
    const resume = createEmptyResume('id', 'name');
    const updated = applyWriteback(resume, [
      { resumePath: 'education.school', value: '北大' },
    ]);
    expect(updated.education).toHaveLength(1);
    expect(updated.education[0].school).toBe('北大');
  });

  it('splits comma-separated values for string-array fields', () => {
    const resume = createEmptyResume('id', 'name');
    const updated = applyWriteback(resume, [
      { resumePath: 'skills.languages', value: 'JS, TS, Go' },
    ]);
    expect(updated.skills.languages).toEqual(['JS', 'TS', 'Go']);
  });

  it('grows array with empty entries, does not carry fields from index 0', () => {
    const resume = createEmptyResume('id', 'name');
    resume.education.push({
      school: '北大', schoolEn: '', degree: 'BS', major: 'CS', majorEn: '',
      gpa: '3.8', gpaScale: '4.0', startDate: '2020-09', endDate: '2024-06', honors: [],
    });
    const updated = applyWriteback(resume, [
      { resumePath: 'education[1].school', value: '清华' },
    ]);
    expect(updated.education).toHaveLength(2);
    expect(updated.education[1].school).toBe('清华');
    expect(updated.education[1].major).toBeUndefined();
    expect(updated.education[1].degree).toBeUndefined();
  });
});
