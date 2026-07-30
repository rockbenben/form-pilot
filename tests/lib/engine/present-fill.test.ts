import { describe, it, expect, beforeEach } from 'vitest';
import { orchestrateFill } from '@/lib/engine/orchestrator';
import { createEmptyResume, type Resume } from '@/lib/storage/types';
import { PRESENT } from '@/lib/present-date';

/**
 * A still-current job stores the PRESENT sentinel. Before this was handled,
 * a fill typed the literal English word "present" into Chinese boards.
 */
function resumeWithCurrentJob(): Resume {
  const base = createEmptyResume('t', 't');
  return {
    ...base,
    work: [{
      company: '示例科技有限公司', companyEn: '', title: '产品经理', titleEn: '',
      department: '', location: '', startDate: '2021-03', endDate: PRESENT, description: '',
    }],
  };
}

function docWithEndDate(lang: string, title: string): Document {
  const d = document.implementation.createHTMLDocument(title);
  d.documentElement.setAttribute('lang', lang);
  d.body.innerHTML =
    '<form><div><label for="ed">离职时间</label><input id="ed" name="ed" type="text"></div></form>';
  return d;
}

const filledValue = (d: Document) => d.querySelector<HTMLInputElement>('#ed')!.value;

describe('orchestrateFill · PRESENT sentinel', () => {
  it('types 至今 into a Chinese page, never the raw sentinel', async () => {
    const doc = docWithEndDate('zh-CN', '我的简历');
    await orchestrateFill(doc, resumeWithCurrentJob(), null);
    expect(filledValue(doc)).toBe('至今');
    expect(filledValue(doc)).not.toBe(PRESENT);
  });

  it('types Present into an English page', async () => {
    const doc = docWithEndDate('en-US', 'Careers');
    await orchestrateFill(doc, resumeWithCurrentJob(), null);
    expect(filledValue(doc)).toBe('Present');
  });

  // The page decides, not the extension UI locale — the text lands in that
  // page's form.
  it('leaves an ordinary date untouched', async () => {
    const base = createEmptyResume('t', 't');
    const r: Resume = {
      ...base,
      work: [{
        company: 'A', companyEn: '', title: 'B', titleEn: '',
        department: '', location: '', startDate: '2019-01', endDate: '2021-02', description: '',
      }],
    };
    const doc = docWithEndDate('zh-CN', '我的简历');
    await orchestrateFill(doc, r, null);
    expect(filledValue(doc)).toBe('2021-02');
  });
});
