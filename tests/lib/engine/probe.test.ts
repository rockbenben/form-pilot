import { describe, it, expect, vi, beforeEach } from 'vitest';
import { probeResumeFields } from '@/lib/engine/probe';
import { matchField } from '@/lib/engine/heuristic/engine';

vi.mock('@/lib/engine/heuristic/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/engine/heuristic/engine')>();
  return { ...actual, matchField: vi.fn(actual.matchField) };
});

const mockedMatchField = vi.mocked(matchField);

function setBody(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

beforeEach(() => {
  mockedMatchField.mockClear();
  document.body.innerHTML = '';
});

describe('probeResumeFields', () => {
  it('returns 0 for a rich-text page with no resume-ish fields', () => {
    const doc = setBody(`
      <div contenteditable="true"></div>
      <div contenteditable="true"></div>
      <div contenteditable="true"></div>
      <input type="text">
    `);
    expect(probeResumeFields(doc)).toBe(0);
  });

  it('returns at most 1 for a login page', () => {
    const doc = setBody(`
      <input name="email" type="email">
      <input name="password" type="password">
      <input type="submit" value="Log in">
    `);
    expect(probeResumeFields(doc)).toBeLessThanOrEqual(1);
  });

  it('reaches the threshold on an application form', () => {
    const doc = setBody(`
      <input name="fullName">
      <input name="email">
      <input name="phone">
      <select name="gender"><option>男</option></select>
      <input name="school">
      <input name="major">
    `);
    expect(probeResumeFields(doc)).toBeGreaterThanOrEqual(5);
  });

  it('counts distinct paths, not fields', () => {
    const doc = setBody(`
      <input name="fullName">
      <input name="fullName">
      <input name="fullName">
      <input name="fullName">
    `);
    expect(probeResumeFields(doc)).toBe(1);
  });

  it('short-circuits once the target is reached', () => {
    const doc = setBody(`
      <input name="fullName">
      <input name="email">
      <input name="phone">
      <select name="gender"><option>男</option></select>
      <input name="school">
      <input name="major">
      <input name="gpa">
      <input name="nationality">
      <input name="ethnicity">
    `);
    expect(probeResumeFields(doc, { target: 5 })).toBe(5);
    expect(mockedMatchField.mock.calls.length).toBeLessThan(9);
  });

  it('honours the element ceiling', () => {
    const doc = setBody(Array.from({ length: 1000 }, () => '<input type="text">').join(''));
    probeResumeFields(doc, { maxElements: 300 });
    expect(mockedMatchField.mock.calls.length).toBeLessThanOrEqual(300);
  });

  it('skips non-data input types', () => {
    const doc = setBody(`
      <input type="hidden" name="fullName">
      <input type="submit" name="email">
      <input type="button" name="phone">
    `);
    expect(probeResumeFields(doc)).toBe(0);
  });

  it('does not abort when matchField throws on one element', () => {
    let calls = 0;
    mockedMatchField.mockImplementation(((el: Element) => {
      calls += 1;
      if (calls === 1) throw new Error('detached');
      return { element: el, resumePath: 'basic.email', label: 'e', inputType: 'text', confidence: 0.9, source: 'heuristic' };
    }) as typeof matchField);
    const doc = setBody('<input name="a"><input name="b">');
    expect(probeResumeFields(doc)).toBe(1);
  });

  it('ignores matches below the confidence bar', () => {
    mockedMatchField.mockImplementation(((el: Element) => ({
      element: el, resumePath: 'basic.email', label: 'e', inputType: 'text', confidence: 0.4, source: 'heuristic',
    })) as typeof matchField);
    const doc = setBody('<input name="a">');
    expect(probeResumeFields(doc)).toBe(0);
  });
});
