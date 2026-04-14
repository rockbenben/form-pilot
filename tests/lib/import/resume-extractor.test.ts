import { describe, it, expect } from 'vitest';
import { extractResumeFields } from '@/lib/import/resume-extractor';

describe('resume-extractor', () => {
  it('extracts email from text', () => {
    const result = extractResumeFields('联系方式: zhangsan@gmail.com 电话 13812345678');
    expect(result.basic.email).toBe('zhangsan@gmail.com');
  });

  it('extracts phone number', () => {
    const result = extractResumeFields('手机: 138-1234-5678');
    expect(result.basic.phone).toBe('138-1234-5678');
  });

  it('extracts name from common resume header patterns', () => {
    const result = extractResumeFields('张三\n男 | 25岁 | 北京\nzhangsan@gmail.com');
    expect(result.basic.name).toBe('张三');
  });

  it('extracts education entries', () => {
    const text = `教育经历\n北京大学 计算机科学与技术 本科 2018.09-2022.06\nGPA: 3.8/4.0`;
    const result = extractResumeFields(text);
    expect(result.education.length).toBeGreaterThanOrEqual(1);
    expect(result.education[0].school).toBe('北京大学');
  });

  it('extracts skills', () => {
    const text = '技能: JavaScript, TypeScript, React, Node.js, Python';
    const result = extractResumeFields(text);
    expect(result.skills.languages.length + result.skills.frameworks.length).toBeGreaterThan(0);
  });

  it('handles English resume text', () => {
    const result = extractResumeFields('John Smith\njohn@example.com\n+1-555-123-4567');
    expect(result.basic.email).toBe('john@example.com');
  });
});
