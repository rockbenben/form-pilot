import { describe, it, expect } from 'vitest';
import { extractResumeFields, toResume } from '@/lib/import/resume-extractor';

// The text fed to extractResumeFields comes from PDF/Word extraction of an
// arbitrary user file — it can be empty, enormous, or full of junk. It must
// never throw or hang; ImportDialog relies on getting *some* object back.

describe('extractResumeFields — adversarial input', () => {
  it('handles empty / whitespace-only text', () => {
    for (const t of ['', '   ', '\n\n\t  \n']) {
      const r = extractResumeFields(t);
      expect(r.basic).toEqual({ name: '', email: '', phone: '' });
      expect(r.education).toEqual([]);
      expect(r.skills).toEqual({ languages: [], frameworks: [], tools: [] });
    }
  });

  it('does not hang on a large blob of repeated tokens', () => {
    // Regex-heavy path: skill scan runs ~70 regexes over the whole text.
    // Guard against catastrophic backtracking / pathological slowdown.
    const big = ('email phone C++ React 教育经历 2018.09-2022.06 ').repeat(5000);
    const start = Date.now();
    const r = extractResumeFields(big);
    expect(Date.now() - start).toBeLessThan(2000);
    expect(Array.isArray(r.education)).toBe(true);
  });

  it('survives control characters and broken date ranges', () => {
    const text = '张三\x00\x1f\n教育经历\n清华大学 \x07 本科 计算机 9999.99-0000.00\nReact TypeScript';
    const r = extractResumeFields(text);
    expect(r.basic.name).toBeTypeOf('string');
    // school still detected from the known-schools list
    expect(r.education.some((e) => e.school === '清华大学')).toBe(true);
  });

  it('extracts nothing crashy from a pure email/url soup', () => {
    const text = 'a@b.com http://x.y/z?q=1 mailto:foo@bar.io @@@ ... ::: ';
    const r = extractResumeFields(text);
    expect(r.basic.email).toBe('a@b.com');
    expect(r.basic.name).toBeTypeOf('string');
  });

  it('toResume produces a complete, well-typed Resume from junk extraction', () => {
    const extracted = extractResumeFields('garbage with no resume fields at all');
    const resume = toResume(extracted, 'id-1', 'My Resume');
    // Phase B multi-value fields must be arrays even when nothing was found.
    expect(Array.isArray(resume.basic.phone)).toBe(true);
    expect(Array.isArray(resume.basic.email)).toBe(true);
    expect(resume.basic.phonePinnedId).toBeNull();
    expect(resume.meta.name).toBe('My Resume');
  });
});
