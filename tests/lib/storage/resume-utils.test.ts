import { describe, it, expect } from 'vitest';
import { countFields } from '@/lib/storage/resume-utils';
import { createEmptyResume } from '@/lib/storage/types';

describe('resume-utils · countFields with FieldCandidate arrays', () => {
  it('does not throw when phone/email are candidate arrays', () => {
    const r = createEmptyResume('t', 't');
    const now = Date.now();
    r.basic.phone = [{ id: 'c1', value: '138', label: '', hitCount: 0, createdAt: now, updatedAt: now, lastUrl: '' }];
    // phone: 1 candidate, email: empty array
    expect(() => countFields(r)).not.toThrow();
    const { filled } = countFields(r);
    expect(filled).toBeGreaterThanOrEqual(1); // at least basic.phone counts
  });

  it('counts a filled phone array as 1 and an empty email array as 0', () => {
    const r = createEmptyResume('t2', 't2');
    const now = Date.now();
    r.basic.phone = [{ id: 'c2', value: '139', label: 'mobile', hitCount: 0, createdAt: now, updatedAt: now, lastUrl: '' }];
    // email remains []
    const { filled, total } = countFields(r);
    // phone slot filled, email slot unfilled
    expect(filled).toBeGreaterThanOrEqual(1);
    expect(total).toBeGreaterThan(filled); // email (empty) keeps total > filled
  });

  it('counts empty phone/email arrays as unfilled', () => {
    const r = createEmptyResume('t3', 't3');
    // Both arrays empty by default
    expect(() => countFields(r)).not.toThrow();
    const { filled } = countFields(r);
    // name, phone, email, gender, birthday, nationality, location all empty → those slots = 0
    expect(filled).toBe(0);
  });

  it('counts both phone and email when both have candidates', () => {
    const r = createEmptyResume('t4', 't4');
    const now = Date.now();
    r.basic.phone = [{ id: 'p1', value: '138', label: '', hitCount: 0, createdAt: now, updatedAt: now, lastUrl: '' }];
    r.basic.email = [{ id: 'e1', value: 'a@b.com', label: '', hitCount: 0, createdAt: now, updatedAt: now, lastUrl: '' }];
    const { filled } = countFields(r);
    // At minimum phone + email = 2 filled slots
    expect(filled).toBeGreaterThanOrEqual(2);
  });
});
