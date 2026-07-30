import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { orchestrateFill } from '@/lib/engine/orchestrator';
import { createEmptyResume, type Resume } from '@/lib/storage/types';

/**
 * End-to-end fill against the board-string fixture, through the real
 * orchestrateFill — the same function the content script calls.
 *
 * Every value is a traceable marker and every date uses a distinct year, so a
 * filled field states which resume path produced it. A work date-input holding
 * 2003 rather than 2001 is education's start leaking into work, which is the
 * class of bug that reached the user twice.
 */
const now = Date.now();
const cand = (v: string) => [{ id: v, value: v, label: '', hitCount: 0, createdAt: now, updatedAt: now, lastUrl: '' }];

function testResume(): Resume {
  const base = createEmptyResume('t', 'test');
  return {
    ...base,
    basic: {
      ...base.basic,
      name: 'NAME', nameEn: 'NAME-EN',
      phone: cand('13900000001'), email: cand('mail@example.com'),
      gender: '男', birthday: '1990-09', nationality: '中国', location: 'CITY',
      workStartDate: '2011-11', currentSalary: 'CUR-SALARY', jobStatus: 'JOB-STATUS',
      summary: 'SUMMARY', socialLinks: { wechat: 'WECHAT' },
    },
    work: [{
      company: 'W-COMPANY', companyEn: '', title: 'W-TITLE', titleEn: '',
      department: 'W-DEPT', location: 'W-CITY',
      startDate: '2001-01', endDate: '2002-02', description: 'W-DESC',
    }],
    projects: [{
      name: 'P-NAME', role: 'P-ROLE', link: '', techStack: [],
      startDate: '2005-05', endDate: '2006-06', description: 'P-DESC',
    }],
    education: [{
      school: 'E-SCHOOL', schoolEn: '', degree: 'E-DEGREE', major: 'E-MAJOR',
      majorEn: '', gpa: '', gpaScale: '',
      startDate: '2003-03', endDate: '2004-04', honors: [],
    }],
    skills: { languages: ['LANG'], tools: ['TOOL'], certificates: [] },
    jobPreference: {
      positions: ['EXP-POSITION'], industries: ['EXP-INDUSTRY'],
      salaryRange: 'EXP-SALARY', jobType: '全职', availableDate: '',
    },
  };
}

function loadFixture(): Document {
  const html = readFileSync('tests/fixtures/board-strings.html', 'utf8');
  const doc = document.implementation.createHTMLDocument('boards');
  doc.documentElement.setAttribute('lang', 'zh-CN');
  doc.body.innerHTML = html.replace(/<!doctype[\s\S]*?<body>/i, '').replace(/<\/body>/i, '');
  return doc;
}

const val = (doc: Document, id: string) => {
  const el = doc.getElementById(id) as HTMLInputElement | null;
  if (!el) throw new Error(`fixture has no #${id}`);
  return el.type === 'checkbox' ? (el.checked ? 'CHECKED' : '') : el.value;
};

describe('fill · board fixture end to end', () => {
  let doc: Document;

  beforeAll(async () => {
    doc = loadFixture();
    await orchestrateFill(doc, testResume(), null);
  });

  it('routes every work date to work, not education', () => {
    expect(val(doc, 'w_start')).toBe('2001-01');
    expect(val(doc, 'w_end')).toBe('2002-02');
  });

  it('routes both project date shapes to project', () => {
    expect(val(doc, 'p_start')).toBe('2005-05');
    expect(val(doc, 'p_end')).toBe('2006-06');
    expect(val(doc, 'p_start_bare')).toBe('2005-05');
    expect(val(doc, 'p_end_bare')).toBe('2006-06');
  });

  it('routes both education date shapes to education', () => {
    expect(val(doc, 'e_start')).toBe('2003-03');
    expect(val(doc, 'e_end')).toBe('2004-04');
    expect(val(doc, 'e_start_bare')).toBe('2003-03');
    expect(val(doc, 'e_end_bare')).toBe('2004-04');
  });

  it('leaves every privacy, scope and classification control untouched', () => {
    for (const id of ['f_secret', 'f_mrms', 'w_intern', 'w_hide', 'w_block', 'e_tongzhao', 'e_cert', 'w_now', 'p_now']) {
      expect(val(doc, id), id).toBe('');
    }
  });

  it('never types anything into the site search box', () => {
    expect(val(doc, 'siteSearch')).toBe('');
  });

  it('fills the identity and contact block', () => {
    expect(val(doc, 'f_name')).toBe('NAME');
    expect(val(doc, 'f_phone')).toBe('13900000001');
    expect(val(doc, 'f_mail')).toBe('mail@example.com');
    expect(val(doc, 'f_wechat')).toBe('WECHAT');
    expect(val(doc, 'f_birth')).toBe('1990-09');
    expect(val(doc, 'f_workstart')).toBe('2011-11');
    expect(val(doc, 'f_status')).toBe('JOB-STATUS');
    expect(val(doc, 'f_summary')).toBe('SUMMARY');
  });

  it('fills the work and project text blocks from their own entity', () => {
    expect(val(doc, 'w_comp')).toBe('W-COMPANY');
    expect(val(doc, 'w_title')).toBe('W-TITLE');
    expect(val(doc, 'w_duty')).toBe('W-DESC');
    expect(val(doc, 'p_name')).toBe('P-NAME');
    expect(val(doc, 'p_role')).toBe('P-ROLE');
    expect(val(doc, 'p_desc')).toBe('P-DESC');
  });

  it('fills education from education', () => {
    expect(val(doc, 'e_school')).toBe('E-SCHOOL');
    expect(val(doc, 'e_degree')).toBe('E-DEGREE');
    expect(val(doc, 'e_major')).toBe('E-MAJOR');
  });

  // 猎聘 asks a project three different questions — 项目描述, 项目职责, 项目业绩 —
  // and Resume has one description per entry. Filling all three put the same
  // paragraph in front of a recruiter three times, and every box looked
  // answered so the user could not tell.
  it('writes each long-form answer once and flags the rest as missing', () => {
    expect(val(doc, 'p_desc')).toBe('P-DESC');
    expect(val(doc, 'p_duty')).toBe('');
    expect(val(doc, 'p_ach')).toBe('');
    expect(val(doc, 'w_duty')).toBe('W-DESC');
    expect(val(doc, 'w_ach')).toBe('');
  });

  // The same datum asked for twice must still be written twice — this rule is
  // about one answer being pasted into several different questions, not about
  // repeated fields.
  it('still repeats a plain value wherever the form asks for it', () => {
    expect(val(doc, 'f_cursal')).toBe('CUR-SALARY');
    expect(val(doc, 'w_salary_now')).toBe('CUR-SALARY');
  });

  it('keeps expected salary and current salary apart', () => {
    expect(val(doc, 'f_expsal')).toBe('EXP-SALARY');
    expect(val(doc, 'f_cursal')).toBe('CUR-SALARY');
    expect(val(doc, 'w_salary_now')).toBe('CUR-SALARY');
  });
});
