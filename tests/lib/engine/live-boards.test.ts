import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { scanForm } from '@/lib/engine/heuristic/engine';

/**
 * Field signals captured from the live resume editors of 猎聘, 智联招聘 and
 * BOSS直聘 — every label, placeholder, aria-label, title, name and id that
 * FormPilot's own findLabelText resolved on each visible input, read out of the
 * real pages. No field values were captured; the two labels a board renders
 * from the user's own masked contact details are replaced with synthetic ones
 * of the same shape.
 *
 * These are a regression floor. The routings asserted below were each wrong at
 * some point and were found by running this capture, not by reading the markup.
 */
const rows = (row: string) => row.split('~');

function build(section: string[], name: string): HTMLElement {
  const form = document.createElement('form');
  section.forEach((row, i) => {
    const [label, ph, aria, title, nm, id, type] = rows(row);
    const wrap = document.createElement('div');
    const elId = id || `${name}-${i}`;
    const el = document.createElement(type === 'textarea' ? 'textarea' : 'input');
    el.setAttribute('id', elId);
    if (nm) el.setAttribute('name', nm);
    if (ph) el.setAttribute('placeholder', ph);
    if (aria) el.setAttribute('aria-label', aria);
    if (title) el.setAttribute('title', title);
    if (el.tagName === 'INPUT') el.setAttribute('type', type === 'search' ? 'text' : type);
    if (label) {
      const l = document.createElement('label');
      l.setAttribute('for', elId);
      l.textContent = label;
      wrap.appendChild(l);
    }
    wrap.appendChild(el);
    form.appendChild(wrap);
  });
  document.body.appendChild(form);
  return form;
}

/** resumePath for the nth input of a captured section, or undefined. */
function routes(file: string, section: string): Array<string | undefined> {
  const data = JSON.parse(readFileSync(`tests/fixtures/${file}`, 'utf8')) as Record<string, string[]>;
  const form = build(data[section], section);
  const got = new Map(scanForm(form).map((m) => [m.element, m.resumePath]));
  const out = [...form.querySelectorAll('input,textarea')].map((el) => got.get(el));
  form.remove();
  return out;
}

describe('live boards · 智联招聘', () => {
  // Both halves of the range carry the label 在职时间; only the placeholder says
  // which end. Weighting by signal TYPE made the label always win, so a job's
  // end date was filled with its start date.
  it('splits the shared 在职时间 range by placeholder', () => {
    const r = routes('board-zhaopin.json', '工作经验');
    expect(r[1]).toBe('work.startDate');
    expect(r[2]).toBe('work.endDate');
    expect(r[3]).toBeUndefined();          // the 至今 toggle
  });

  it('splits 在校时间 and 项目时间 the same way', () => {
    const edu = routes('board-zhaopin.json', '教育经历');
    expect([edu[2], edu[3]]).toEqual(['education.startDate', 'education.endDate']);
    const proj = routes('board-zhaopin.json', '项目经历');
    expect([proj[1], proj[2]]).toEqual(['projects.startDate', 'projects.endDate']);
    expect(proj[3]).toBeUndefined();       // the 至今 toggle
  });

  it('rejects the site search box and the 有无 yes/no', () => {
    expect(routes('board-zhaopin.json', '基本信息')[0]).toBeUndefined();
    expect(routes('board-zhaopin.json', '教育经历')[4]).toBeUndefined();
  });

  it('reads the opening pitch from its long placeholder', () => {
    expect(routes('board-zhaopin.json', '自我评价')[0]).toBe('basic.summary');
  });
});

describe('live boards · 猎聘', () => {
  // 猎聘 labels none of its date inputs — work, project and education modals all
  // show a bare 「开始时间」. The entity comes from the other fields in the modal.
  it('re-homes its unlabelled dates to the section they sit in', () => {
    const work = routes('board-liepin.json', 'workExp');
    expect([work[2], work[3]]).toEqual(['work.startDate', 'work.endDate']);
    const proj = routes('board-liepin.json', 'projectExp');
    expect([proj[1], proj[2]]).toEqual(['projects.startDate', 'projects.endDate']);
    const edu = routes('board-liepin.json', 'eduExp');
    expect([edu[4], edu[5]]).toEqual(['education.startDate', 'education.endDate']);
  });

  it('rejects every privacy and scope control', () => {
    const basic = routes('board-liepin.json', 'basicInfo');
    expect(basic[1]).toBeUndefined();      // 显示先生/女士
    expect(basic[4]).toBeUndefined();      // 薪资显示为保密
    const work = routes('board-liepin.json', 'workExp');
    expect(work[7]).toBeUndefined();       // 本段经历是实习经历
    expect(work[8]).toBeUndefined();       // 对该公司屏蔽我的简历
    expect(routes('board-liepin.json', 'eduExp')[2]).toBeUndefined();  // 是否统招
  });

  it('finds the name and the pitch from signals other than a label', () => {
    expect(routes('board-liepin.json', 'basicInfo')[0]).toBe('basic.name');
    expect(routes('board-liepin.json', 'selfAssess')[0]).toBe('basic.summary');
  });
});

describe('live boards · BOSS直聘', () => {
  // Its editor resolves two labels to the user's own displayed contact details;
  // the placeholder is what identifies these fields.
  it('matches every field in the basic modal', () => {
    const r = routes('board-boss.json', '基本信息');
    expect(r).toEqual([
      'basic.name', 'basic.birthday', 'basic.phone',
      'basic.workStartDate', 'basic.socialLinks.wechat', 'basic.email',
    ]);
  });
});
