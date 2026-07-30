import { describe, it, expect } from 'vitest';
import { extractResumeFields, toResume } from '@/lib/import/resume-extractor';

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
    expect(result.skills.languages.length + result.skills.tools.length).toBeGreaterThan(0);
  });

  it('handles English resume text', () => {
    const result = extractResumeFields('John Smith\njohn@example.com\n+1-555-123-4567');
    expect(result.basic.email).toBe('john@example.com');
  });
});

describe('resume-extractor · name extraction on real-world layouts', () => {
  // Regression: a CJK resume opens with the name followed on the SAME line by
  // gender / age / years, so requiring the name to sit alone on a short line
  // skipped it and the scan ran on until it hit the IM handle two lines down.
  it('takes the leading Han run when the header line carries metadata', () => {
    const text = [
      '张明远 男 · 32 岁 · 工作 9 年 3 个月 · 保密 · 杭州 · 本科 · 群众',
      '13800138000',
      'mingyuan@example.com',
      'mingyuan',
    ].join('\n');
    expect(extractResumeFields(text).basic.name).toBe('张明远');
  });

  it('does not mistake a lowercase handle for a name', () => {
    const text = ['13800138000', 'mingyuan@example.com', 'mingyuan'].join('\n');
    expect(extractResumeFields(text).basic.name).toBe('');
  });

  // 优势亮点 is also 2-4 Han chars at the start of a line, so the head match
  // alone would return it. Note the extractor cannot tell a bare 4-character
  // job title from a name without context — the contract is only that known
  // section headings lose to a real name, not that every non-name is rejected.
  it('lets a real name win over a section heading that precedes it', () => {
    const text = ['优势亮点', '- 十年产品经验', '张明远', 'a@b.com'].join('\n');
    expect(extractResumeFields(text).basic.name).toBe('张明远');
  });

  it('returns nothing when only section headings are present', () => {
    const text = ['优势亮点', '求职意向', '工作经历', '教育背景'].join('\n');
    expect(extractResumeFields(text).basic.name).toBe('');
  });

  it('skips a company name that runs longer than a personal name', () => {
    const text = ['杭州示例数字科技有限公司 产品经理 2019.03-至今', '张明远'].join('\n');
    expect(extractResumeFields(text).basic.name).toBe('张明远');
  });

  it('still accepts a capitalised Latin name', () => {
    expect(extractResumeFields(['San Zhang', 'a@b.com'].join('\n')).basic.name).toBe('San Zhang');
  });
});

describe('resume-extractor · labelled fields', () => {
  it('reads 「标签：值」 inline, several to a line', () => {
    const r = extractResumeFields('求职意向：产品经理 | 期望薪资：45-60K | 期望城市：上海');
    expect(r.jobPreference.positions).toEqual(['产品经理']);
    expect(r.jobPreference.salaryRange).toBe('45-60K');
    expect(r.jobPreference.cities).toEqual(['上海']);
  });

  // Board-exported resumes wrap the value onto the next line.
  it('reads a value that sits on the line below its label', () => {
    const r = extractResumeFields(['期望工作地区：', '杭州', '期望月薪：', '30-40K'].join('\n'));
    expect(r.jobPreference.cities).toEqual(['杭州']);
    expect(r.jobPreference.salaryRange).toBe('30-40K');
  });

  it('does not borrow a neighbouring segment when a label is bare', () => {
    const r = extractResumeFields('现居住地： | 性别：男');
    expect(r.basic.location).toBe('');
    expect(r.basic.gender).toBe('男');
  });

  it('falls back to the unlabelled header for gender', () => {
    const r = extractResumeFields('张明远 男 · 32 岁 · 杭州 · 本科');
    expect(r.basic.gender).toBe('男');
  });

  // An age is not a birthday: deriving one would be wrong for most of the year
  // yet stored as though it were fact.
  it('takes an explicit birth date but never derives one from an age', () => {
    expect(extractResumeFields('男 32 岁(1993年3月) 本科').basic.birthday).toBe('1993-03');
    expect(extractResumeFields('男 32 岁 本科').basic.birthday).toBe('');
  });

  it('splits multi-value preferences', () => {
    const r = extractResumeFields('期望城市：上海、杭州,北京');
    expect(r.jobPreference.cities).toEqual(['上海', '杭州', '北京']);
  });
});

describe('resume-extractor · experience sections', () => {
  it('pairs a company header with the date range on the same line', () => {
    const r = extractResumeFields(
      ['工作经历', '杭州示例科技有限公司 产品经理 2019.03-至今', '负责产品线规划。'].join('\n'),
    );
    expect(r.work).toHaveLength(1);
    expect(r.work[0].company).toBe('杭州示例科技有限公司');
    expect(r.work[0].title).toBe('产品经理');
    expect(r.work[0].endDate).toBe('present');
    expect(r.work[0].description).toContain('负责产品线规划');
  });

  // Board exports put the date on its own line under the name.
  it('looks back one line when the date range stands alone', () => {
    const r = extractResumeFields(
      ['工作经历', '杭州示例科技有限公司', '2019.03 - 2023.03', '负责产品线规划。'].join('\n'),
    );
    expect(r.work).toHaveLength(1);
    expect(r.work[0].company).toContain('示例科技');
    expect(r.work[0].startDate).toBe('2019-03');
  });

  it('keeps projects separate from work', () => {
    const r = extractResumeFields(
      ['工作经历', 'A公司 经理 2019.03-至今', '项目经历', '示例项目 负责人 2020.01-2021.01', '做了一些事。'].join('\n'),
    );
    expect(r.work).toHaveLength(1);
    expect(r.projects).toHaveLength(1);
    expect(r.projects[0].name).toContain('示例项目');
  });
});

describe('resume-extractor · school detection', () => {
  // Regression: this was a hardcoded list of 28 universities, so anyone who
  // attended any other school imported with an empty school field.
  it('recognises schools by name shape, not by a fixed list', () => {
    for (const school of ['杭州电子科技大学', '南京审计学院', '某某职业技术学院']) {
      const r = extractResumeFields(['教育经历', `${school} 本科 计算机 2015.09-2019.06`].join('\n'));
      expect(r.education[0]?.school).toBe(school);
    }
  });
});

describe('resume-extractor · entry header splitting', () => {
  // Regression: the suffix list matches inside the JOB TITLE too — 网络运营专员
  // contains 网络. Scanning character offsets picked either too little
  // (leftmost) or too much (rightmost); the space is the real boundary.
  it('does not let a suffix word inside the title extend the company name', () => {
    const r = extractResumeFields(
      ['工作经历', '上海示例网络科技有限公司 网络运营专员 2015.03-2017.02'].join('\n'),
    );
    expect(r.work[0].company).toBe('上海示例网络科技有限公司');
    expect(r.work[0].title).toBe('网络运营专员');
  });

  it('keeps a multi-token company name together', () => {
    const r = extractResumeFields(
      ['工作经历', '示例 数字 科技有限公司 产品经理 2019.03-至今'].join('\n'),
    );
    expect(r.work[0].company).toBe('示例 数字 科技有限公司');
    expect(r.work[0].title).toBe('产品经理');
  });

  // Board exports print the date range ABOVE the company; most templates print
  // it below. Looking only backwards grabbed the tail of the previous entry's
  // description on every date-first file.
  it('finds the name below the date when the layout is date-first', () => {
    const r = extractResumeFields(
      [
        '工作经历',
        '2017.03-2023.03',
        '上海示例文化传媒有限公司',
        '负责品牌与市场。',
        '2015.03-2017.02',
        '上海示例网络科技有限公司',
        '负责渠道推广。',
      ].join('\n'),
    );
    expect(r.work).toHaveLength(2);
    expect(r.work[0].company).toBe('上海示例文化传媒有限公司');
    expect(r.work[0].description).toContain('负责品牌与市场');
    expect(r.work[1].company).toBe('上海示例网络科技有限公司');
    expect(r.work[1].description).toContain('负责渠道推广');
  });

  it('does not take a bullet or a sentence as an entry name', () => {
    const r = extractResumeFields(
      ['工作经历', '- 这是一条描述项。', '2019.03-至今', '这是完整的一句话。'].join('\n'),
    );
    expect(r.work).toHaveLength(0);
  });
});

describe('resume-extractor · fields the boards ask for', () => {
  it('reads them from labels and carries them into the Resume', () => {
    const text = [
      '参加工作时间：2015-03',
      '目前状态：离职-随时到岗',
      '当前月薪：30-40K',
      '微信号：mingyuan_demo',
      '期望月薪：45-60K',
    ].join('\n');
    const r = extractResumeFields(text);
    expect(r.basic.workStartDate).toBe('2015-03');
    expect(r.basic.jobStatus).toBe('离职-随时到岗');
    expect(r.basic.currentSalary).toBe('30-40K');
    expect(r.basic.wechat).toBe('mingyuan_demo');
    // The expected salary must land in job preference, not overwrite the current one.
    expect(r.jobPreference.salaryRange).toBe('45-60K');

    const resume = toResume(r, 'id', 'name');
    expect(resume.basic.workStartDate).toBe('2015-03');
    expect(resume.basic.jobStatus).toBe('离职-随时到岗');
    expect(resume.basic.currentSalary).toBe('30-40K');
    expect(resume.basic.socialLinks.wechat).toBe('mingyuan_demo');
  });

  it('leaves socialLinks untouched when no WeChat is present', () => {
    const resume = toResume(extractResumeFields('姓名：张明远'), 'id', 'name');
    expect(resume.basic.socialLinks).toEqual({});
  });
});

describe('resume-extractor · prose is not an entry', () => {
  // A live fill surfaced this: the company came out as one short word and the
  // title as a fragment of a sentence, because a description line happened to
  // contain a date range and was taken as an entry header.
  it('ignores a date range that appears inside a sentence', () => {
    const r = extractResumeFields(
      [
        '工作经历',
        '杭州示例科技有限公司 产品经理 2019.03-至今',
        '支持 API 与多渠道预警的建设，2020.01-2021.06 期间主导了整条链路的重构与上线。',
      ].join('\n'),
    );
    expect(r.work).toHaveLength(1);
    expect(r.work[0].company).toBe('杭州示例科技有限公司');
    expect(r.work[0].title).toBe('产品经理');
    expect(r.work[0].description).toContain('支持 API');
  });

  it('does not open an entry on a bulleted line carrying a date range', () => {
    const r = extractResumeFields(
      ['工作经历', '- 2020.01-2021.06 负责渠道推广与投放。'].join('\n'),
    );
    expect(r.work).toHaveLength(0);
  });

  it('still accepts a genuine header on the same line as its dates', () => {
    const r = extractResumeFields(
      ['工作经历', '示例传媒有限公司 市场总监 2017.03-2023.03'].join('\n'),
    );
    expect(r.work[0].company).toBe('示例传媒有限公司');
    expect(r.work[0].title).toBe('市场总监');
  });
});

describe('resume-extractor · a guessed employer is worse than none', () => {
  // The fallback "first word is the company, the rest is the title" is what
  // turned a stray sentence into an entry. A wrong value gets typed into a real
  // application with no sign it was guessed; a missing one shows as
  // 「missing from your profile」 and gets filled in by hand.
  it('drops a work entry whose header names no recognisable employer', () => {
    const r = extractResumeFields(
      ['工作经历', '支持 API 与多渠道预警 2019.03-至今'].join('\n'),
    );
    expect(r.work).toHaveLength(0);
  });

  it('keeps the entry when the header does name one', () => {
    const r = extractResumeFields(
      ['工作经历', '杭州示例科技有限公司 产品经理 2019.03-至今'].join('\n'),
    );
    expect(r.work).toHaveLength(1);
    expect(r.work[0].company).toBe('杭州示例科技有限公司');
  });

  it('accepts the other organisation suffixes too', () => {
    for (const org of ['示例集团', '示例研究院', '示例工作室']) {
      const r = extractResumeFields(['工作经历', `${org} 经理 2019.03-至今`].join('\n'));
      expect(r.work[0]?.company).toBe(org);
    }
  });
});
