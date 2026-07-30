import { describe, it, expect } from 'vitest';
import { extractResumeFields } from '@/lib/import/resume-extractor';

/**
 * The three entry layouts found in real board exports. The parser used to
 * anchor on the date range, which only ever handled the first of these.
 * Content is synthetic; only the shapes are copied.
 */
const r = (lines: string[]) => extractResumeFields(lines.join('\n'));

describe('experience layouts · date-first (company export)', () => {
  const out = r([
    '工作经历',
    '2023.03 - 至今',
    '示例科技有限公司',
    '高级产品经理',
    '广告/公关/营销',
    '工作描述：',
    '负责 B 端工作台的需求与迭代，从 0 到 1 搭建结算流程。',
    '2017.03 - 2023.03',
    '样例网络技术有限公司',
    '品牌策划经理',
    '统筹品牌与市场投放，团队 12 人。',
  ]);

  it('reads both entries with their titles', () => {
    expect(out.work).toHaveLength(2);
    expect(out.work[0].company).toBe('示例科技有限公司');
    expect(out.work[0].title).toBe('高级产品经理');
    expect(out.work[1].company).toBe('样例网络技术有限公司');
    expect(out.work[1].title).toBe('品牌策划经理');
  });

  // The title used to come back empty on this layout: the date line was taken
  // as the header, the company was read from the line below it, and the title
  // one line further down was never claimed.
  it('does not leave the title empty', () => {
    expect(out.work.every((w) => w.title.length > 0)).toBe(true);
  });

  it('keeps the dates attached to the right entry', () => {
    expect(out.work[0].endDate).toBe('present');
    expect(out.work[1].startDate).toBe('2017-03');
    expect(out.work[1].endDate).toBe('2023-03');
  });
});

describe('experience layouts · date buried in the description', () => {
  // This shape produced zero work entries: the date sits eight lines below the
  // company, so a date-anchored parser could not pair them.
  const out = r([
    '工作经历',
    '示例科技有限公司',
    'AI 产品负责人',
    '职责业绩：独立负责 AI 产品线从战略定义到落地的全链路。',
    '- 开源产品矩阵：主导多语言 AI 工具产品。',
    '- 舆情监测 SaaS：从 0 到 1 独立打造，面向中小企业。',
    '2023/03- 至今',
    '- 企业 AI 能力普及：搭建工具资源库与提示词模板库。',
    '样例网络技术有限公司',
    '市场总监',
    '统筹品牌与市场投放。',
  ]);

  it('finds both entries', () => {
    expect(out.work).toHaveLength(2);
    expect(out.work[0].company).toBe('示例科技有限公司');
    expect(out.work[0].title).toBe('AI 产品负责人');
  });

  it('claims the date from inside the description', () => {
    expect(out.work[0].startDate).toBe('2023-03');
    expect(out.work[0].endDate).toBe('present');
  });
});

describe('experience layouts · one line per entry', () => {
  const out = r([
    '工作经历',
    '示例科技有限公司 市场总监 2017.03-2023.03',
    '样例网络技术有限公司 网络运营专员 2015.03-2017.02',
    '第三示例贸易有限公司 品牌经理 2012.08-2014.10',
  ]);

  // Consecutive single-line headers are separate entries, not one entry with
  // three attribute lines. Merging them collapsed three jobs into one.
  it('keeps consecutive single-line headers apart', () => {
    expect(out.work).toHaveLength(3);
    expect(out.work.map((w) => w.company)).toEqual([
      '示例科技有限公司', '样例网络技术有限公司', '第三示例贸易有限公司',
    ]);
    expect(out.work.map((w) => w.title)).toEqual(['市场总监', '网络运营专员', '品牌经理']);
  });
});

describe('experience classification', () => {
  it('files a company-named entry as work even under a 项目经历 heading', () => {
    const out = r([
      '项目经历',
      '示例科技有限公司',
      '高级产品经理',
      '负责结算工作台的需求与迭代。',
    ]);
    expect(out.work.map((w) => w.company)).toContain('示例科技有限公司');
    expect(out.projects).toHaveLength(0);
  });

  it('files a non-company entry as a project', () => {
    const out = r([
      '项目经历',
      '结算工作台',
      '产品负责人',
      '把三套人工对账流程收敛成一个工作台。',
    ]);
    expect(out.projects.map((p) => p.name)).toContain('结算工作台');
    expect(out.work).toHaveLength(0);
  });

  // 大学 is in the company-suffix list, so a school used to import as an
  // employer — and before that, as a project.
  it('never turns a school into a job or a project', () => {
    const out = r([
      '工作经历',
      '示例大学 本科 历史 2008-2012',
      '在校期间参与学生会工作。',
    ]);
    expect(out.work.some((w) => /大学/.test(w.company))).toBe(false);
    expect(out.projects.some((p) => /大学/.test(p.name))).toBe(false);
  });

  // 网络 is a suffix token, but only at the END of a name. 网络运营专员 is a
  // job title and used to be read as the employer.
  it('does not mistake a title containing a suffix word for the employer', () => {
    const out = r([
      '工作经历',
      '2015.03 - 2017.02',
      '样例网络技术有限公司',
      '网络运营专员',
      '负责渠道投放。',
    ]);
    expect(out.work).toHaveLength(1);
    expect(out.work[0].company).toBe('样例网络技术有限公司');
    expect(out.work[0].title).toBe('网络运营专员');
  });
});
