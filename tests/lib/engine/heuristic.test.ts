import { describe, it, expect, afterEach } from 'vitest';
import { matchField, scanForm } from '@/lib/engine/heuristic/engine';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('matchField', () => {
  it('matches email by name attribute with confidence >= 0.9', () => {
    const el = document.createElement('input');
    el.setAttribute('name', 'email');
    el.setAttribute('type', 'text');
    const mapping = matchField(el);
    expect(mapping).not.toBeNull();
    expect(mapping!.resumePath).toBe('basic.email');
    expect(mapping!.confidence).toBeGreaterThanOrEqual(0.9);
    expect(mapping!.source).toBe('heuristic');
  });

  it('matches name by label text', () => {
    document.body.innerHTML = `
      <label for="applicant-name">姓名</label>
      <input id="applicant-name" type="text" />
    `;
    const el = document.body.querySelector('input') as HTMLInputElement;
    const mapping = matchField(el);
    expect(mapping).not.toBeNull();
    expect(mapping!.resumePath).toBe('basic.name');
  });

  it('matches phone by placeholder', () => {
    const el = document.createElement('input');
    el.setAttribute('placeholder', '请输入手机号');
    const mapping = matchField(el);
    expect(mapping).not.toBeNull();
    expect(mapping!.resumePath).toBe('basic.phone');
  });

  it('returns null for unrecognized fields', () => {
    const el = document.createElement('input');
    el.setAttribute('name', 'xyzunknownfield123');
    const mapping = matchField(el);
    expect(mapping).toBeNull();
  });

  it('uses highest confidence signal when multiple signals match', () => {
    // name attribute has weight 0.95, placeholder has weight 0.8
    // Both match email — the name attr should drive confidence
    const el = document.createElement('input');
    el.setAttribute('name', 'email');
    el.setAttribute('placeholder', '请输入邮箱地址');
    const mapping = matchField(el);
    expect(mapping).not.toBeNull();
    expect(mapping!.resumePath).toBe('basic.email');
    // The confidence should reflect the highest-weight signal (nameAttr = 0.95)
    expect(mapping!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('matches education school by name attribute', () => {
    const el = document.createElement('input');
    el.setAttribute('name', 'school');
    const mapping = matchField(el);
    expect(mapping).not.toBeNull();
    expect(mapping!.resumePath).toBe('education.school');
  });

  it('matches work company by label text', () => {
    document.body.innerHTML = `
      <label for="comp">公司名称</label>
      <input id="comp" type="text" />
    `;
    const el = document.body.querySelector('input') as HTMLInputElement;
    const mapping = matchField(el);
    expect(mapping).not.toBeNull();
    expect(mapping!.resumePath).toBe('work.company');
  });

  it('sets inputType correctly in mapping', () => {
    const el = document.createElement('select');
    el.setAttribute('name', 'degree');
    const mapping = matchField(el);
    expect(mapping).not.toBeNull();
    expect(mapping!.inputType).toBe('select');
  });
});

describe('scanForm', () => {
  it('returns multiple mappings for a form with multiple matching fields', () => {
    document.body.innerHTML = `
      <form>
        <input name="email" type="text" />
        <input name="phone" type="tel" />
        <input name="xyzunknown" type="text" />
      </form>
    `;
    const form = document.body.querySelector('form') as HTMLFormElement;
    const mappings = scanForm(form);
    expect(mappings.length).toBeGreaterThanOrEqual(2);
    const paths = mappings.map((m) => m.resumePath);
    expect(paths).toContain('basic.email');
    expect(paths).toContain('basic.phone');
  });

  it('returns empty array for form with no recognizable fields', () => {
    document.body.innerHTML = `
      <form>
        <input name="xyzfoo" type="text" />
        <input name="abcbar" type="text" />
      </form>
    `;
    const form = document.body.querySelector('form') as HTMLFormElement;
    const mappings = scanForm(form);
    expect(mappings).toHaveLength(0);
  });
});

describe('patterns · email wording used by job boards', () => {
  const el = (html: string): Element => {
    document.body.innerHTML = html;
    return document.body.firstElementChild!;
  };

  // A live 猎聘 basic-info form labels its email field only by the placeholder
  // 「用于接收面试邮件」. The pattern list required 邮箱 / 电子邮件 / 邮件地址,
  // so the field matched nothing and imported email was never filled there.
  it('matches an email field described as 面试邮件', () => {
    const m = matchField(el('<input placeholder="用于接收面试邮件">'));
    expect(m?.resumePath).toBe('basic.email');
  });

  it('still matches the conventional wordings', () => {
    for (const ph of ['邮箱', '电子邮件', '邮件地址', 'Email']) {
      expect(matchField(el(`<input placeholder="${ph}">`))?.resumePath).toBe('basic.email');
    }
  });

  // 邮 alone is far too broad — these must not be dragged in with it.
  it('does not match postal wording', () => {
    for (const ph of ['公司邮编', '邮寄地址', '邮政编码']) {
      expect(matchField(el(`<input placeholder="${ph}">`))?.resumePath).not.toBe('basic.email');
    }
  });
});

describe('patterns · wordings verified on live job boards', () => {
  const el = (html: string): Element => {
    document.body.innerHTML = html;
    return document.body.querySelector('input')!;
  };

  // 智联招聘 labels this field 出生年月, which shares no substring with the
  // 出生日期 / 生日 the pattern list carried.
  it('matches a birthday labelled 出生年月', () => {
    expect(matchField(el('<label for="a">出生年月:</label><input id="a">'))?.resumePath).toBe('basic.birthday');
  });

  it('still matches the conventional birthday wordings', () => {
    for (const l of ['出生日期', '生日', 'Birthday']) {
      expect(matchField(el(`<label for="a">${l}</label><input id="a">`))?.resumePath).toBe('basic.birthday');
    }
  });

  // A colon must not stop an anchored pattern from matching.
  it('matches a name labelled 名字 with a trailing colon', () => {
    expect(matchField(el('<label for="a">名字:</label><input id="a">'))?.resumePath).toBe('basic.name');
  });
});

describe('patterns · fields the boards ask for that Resume now holds', () => {
  const el = (html: string): Element => {
    document.body.innerHTML = html;
    return document.body.querySelector('input')!;
  };
  const path = (html: string) => matchField(el(html))?.resumePath;

  // 智联招聘 and BOSS 直聘 both ask when you started working rather than for a
  // number of years.
  it('matches 参加工作时间', () => {
    expect(path('<label for="a">参加工作时间</label><input id="a">')).toBe('basic.workStartDate');
    expect(path('<input placeholder="请选择参加工作时间">')).toBe('basic.workStartDate');
  });

  // 猎聘 (id nowSalary) and the usual Chinese wordings.
  it('matches current salary', () => {
    expect(path('<input id="nowSalary">')).toBe('basic.currentSalary');
    for (const l of ['当前薪资', '目前月薪', '税前月薪']) {
      expect(path(`<label for="a">${l}</label><input id="a">`)).toBe('basic.currentSalary');
    }
  });

  // The trap: jobPreference.salaryRange already claims 薪资, and 智联 labels the
  // expected-salary field 期望月薪. A bare 月薪 in the current-salary pattern
  // would quietly route the expected salary into the current one.
  it('does not confuse expected salary with current salary', () => {
    for (const l of ['期望薪资', '期望月薪', '薪资要求']) {
      expect(path(`<label for="a">${l}</label><input id="a">`)).not.toBe('basic.currentSalary');
    }
  });

  it('matches job-seeking status', () => {
    for (const l of ['目前状态', '求职状态', '在职状态']) {
      expect(path(`<label for="a">${l}</label><input id="a">`)).toBe('basic.jobStatus');
    }
  });

  // 猎聘 (id wechat) and BOSS (placeholder 请输入您的微信号).
  it('matches WeChat into socialLinks', () => {
    expect(path('<input id="wechat">')).toBe('basic.socialLinks.wechat');
    expect(path('<input placeholder="请输入您的微信号">')).toBe('basic.socialLinks.wechat');
  });
});

describe('patterns · a control is not a data field', () => {
  const el = (html: string): Element => {
    document.body.innerHTML = html;
    return document.body.querySelector('input')!;
  };
  const path = (label: string) =>
    matchField(el(`<label for="a">${label}</label><input type="checkbox" id="a">`))?.resumePath;

  // 猎聘 puts this checkbox beside the salary fields. The bare 薪资 in
  // jobPreference.salaryRange claimed it, so a fill would tick the box that
  // hides the user's salary from recruiters — a silently changed privacy
  // setting, which is worse than a wrong value in a visible text field.
  it('does not treat a privacy toggle as a salary field', () => {
    expect(path('薪资显示为保密')).toBeUndefined();
  });

  it('ignores other behaviour toggles that sit among real fields', () => {
    for (const l of ['显示先生/女士', '是否公开简历', '同意用户协议', '接收职位推送通知']) {
      expect(path(l)).toBeUndefined();
    }
  });

  it('still matches a real field whose label merely mentions display', () => {
    // The guard keys on the wording, not on the control type.
    expect(matchField(el('<label for="a">姓名</label><input id="a">'))?.resumePath).toBe('basic.name');
  });
});

describe('patterns · past role versus wanted role', () => {
  const el = (html: string): Element => {
    document.body.innerHTML = html;
    return document.body.querySelector('input')!;
  };
  const path = (label: string) =>
    matchField(el(`<label for="a">${label}</label><input id="a">`))?.resumePath;

  // work.title sits earlier in the table than jobPreference.positions, so it
  // won every tie — a fill wrote the last employer's title into the field
  // asking what job the user wants next.
  it('routes the preference wordings to job preference', () => {
    for (const l of ['期望职位', '意向岗位', '应聘职位', '求职意向', '搜索职位类别', '岗位类别']) {
      expect(path(l)).toBe('jobPreference.positions');
    }
  });

  it('still routes the history wordings to work experience', () => {
    for (const l of ['职位', '职位名称', '工作职位', '岗位职责', '职称']) {
      expect(path(l)).toBe('work.title');
    }
  });

  it('recognises the industry pickers both boards use', () => {
    for (const l of ['行业类别', '搜索行业类别或产品词', '意向行业', '期望行业']) {
      expect(path(l)).toBe('jobPreference.industries');
    }
  });
});

describe('patterns · the 猎聘 work-experience form', () => {
  const el = (html: string): Element => {
    document.body.innerHTML = html;
    return document.body.querySelector('input, textarea')!;
  };
  const path = (label: string) =>
    matchField(el(`<label for="a">${label}</label><input type="checkbox" id="a">`))?.resumePath;

  // Two more toggles sitting among the real fields on that form. The first is
  // a privacy control — ticking it hides the user's resume from that employer.
  it('does not tick the per-company resume block', () => {
    expect(path('对该公司屏蔽我的简历')).toBeUndefined();
  });

  // The second reclassifies the entry as an internship.
  it('does not tick the internship flag', () => {
    expect(path('本段经历是实习经历')).toBeUndefined();
  });

  it('matches the responsibilities textarea', () => {
    const ta = el('<label for="a">职责业绩</label><textarea id="a"></textarea>');
    expect(matchField(ta)?.resumePath).toBe('work.description');
  });

  it('matches the skills keyword picker, which matched nothing before', () => {
    for (const l of ['请选择技能', '请输入技能关键词', '专业技能']) {
      expect(matchField(el(`<label for="a">${l}</label><input id="a">`))?.resumePath).toBe('skills.tools');
    }
  });

  it('routes unambiguous employment dates to the work entry', () => {
    for (const [l, p] of [['入职时间', 'work.startDate'], ['离职时间', 'work.endDate']] as const) {
      expect(matchField(el(`<label for="a">${l}</label><input id="a">`))?.resumePath).toBe(p);
    }
  });

  // A bare 开始时间 appears on education and work forms alike and cannot be
  // told apart without section context. It keeps going to education, which is
  // where it has always gone — pinned so the ambiguity stays visible.
  it('leaves the ambiguous bare dates with education', () => {
    expect(matchField(el('<label for="a">开始时间</label><input id="a">'))?.resumePath)
      .toBe('education.startDate');
  });
});

describe('patterns · 专业 is a field of study, 专业技能 is not', () => {
  const el = (html: string): Element => {
    document.body.innerHTML = html;
    return document.body.querySelector('input')!;
  };
  const path = (l: string) =>
    matchField(el(`<label for="a">${l}</label><input id="a">`))?.resumePath;

  it('keeps the study field', () => {
    for (const l of ['专业', '所学专业', '主修']) expect(path(l)).toBe('education.major');
  });

  it('does not let it swallow the skills picker', () => {
    expect(path('专业技能')).toBe('skills.tools');
  });
});

describe('patterns · the 猎聘 project form', () => {
  const el = (html: string): Element => {
    document.body.innerHTML = html;
    return document.body.querySelector('input, textarea')!;
  };
  const path = (l: string) =>
    matchField(el(`<label for="a">${l}</label><input id="a">`))?.resumePath;

  // `projects.name` carried a bare 项目 and sits first in the table, so it won
  // every tie: a fill wrote the project's NAME into every field of the section.
  it('gives each project field its own path', () => {
    expect(path('项目名称')).toBe('projects.name');
    expect(path('项目职务')).toBe('projects.role');
    expect(path('项目角色')).toBe('projects.role');
    expect(path('项目描述')).toBe('projects.description');
    expect(path('项目业绩')).toBe('projects.description');
  });

  // 职责 belongs to work.description, which also sits earlier — so the
  // project's own responsibilities textarea was being filled from the job.
  it('keeps 项目职责 in the project section', () => {
    expect(path('项目职责')).toBe('projects.description');
  });

  it('still routes the work wordings to the work entry', () => {
    expect(path('职责')).toBe('work.description');
    expect(path('工作描述')).toBe('work.description');
    expect(path('职责业绩')).toBe('work.description');
  });

  it('leaves a bare 项目 as the name', () => {
    expect(path('项目')).toBe('projects.name');
  });
});

describe('patterns · 智联 and BOSS section forms', () => {
  const el = (html: string): Element => {
    document.body.innerHTML = html;
    return document.body.querySelector('input, textarea')!;
  };
  const path = (l: string) =>
    matchField(el(`<label for="a">${l}</label><input id="a">`))?.resumePath;

  // 智联's header search box. 公司 matched work.company, so a fill would have
  // typed the user's employer into the site-wide search.
  it('does not fill a site-wide search box', () => {
    expect(path('搜索职位、公司')).toBeUndefined();
  });

  // A field's own picker searches exactly one thing and must keep working.
  it('still matches a single-target picker', () => {
    expect(path('搜索职位类别')).toBe('jobPreference.positions');
    expect(path('搜索城市名/区县')).toBe('basic.location');
  });

  // 智联 words its internship flag 本经历, not 本段 — the first guard missed it.
  it('does not tick the internship flag in either wording', () => {
    for (const l of ['本经历是实习经历', '本段经历是实习经历']) {
      expect(
        matchField(el(`<label for="a">${l}</label><input type="checkbox" id="a">`))?.resumePath,
      ).toBeUndefined();
    }
  });

  // 在职时间 is the label BOTH halves of 智联's range share; the start/end
  // distinction lives in each input's placeholder. A lone field carrying only
  // the group label takes the start.
  it('reads a lone 在职时间 field as the start date', () => {
    expect(path('在职时间')).toBe('work.startDate');
  });

  it('pairs a shared range label with each input own placeholder', () => {
    const range = (label: string, ph: string) =>
      matchField(el(`<label for="a">${label}</label><input id="a" placeholder="${ph}">`))?.resumePath;
    expect(range('在职时间', '入职时间')).toBe('work.startDate');
    expect(range('在职时间', '离职时间')).toBe('work.endDate');
    expect(range('在校时间', '入学时间')).toBe('education.startDate');
    expect(range('在校时间', '毕业时间')).toBe('education.endDate');
    expect(range('项目时间', '选择开始时间')).toBe('projects.startDate');
    expect(range('项目时间', '选择结束时间')).toBe('projects.endDate');
  });

  // The third control in each range group is the 「至今」 toggle. Matching the
  // group wording on it meant a fill ticked it.
  it('never treats the 至今 toggle as a date', () => {
    for (const l of ['在职时间', '在校时间', '项目时间']) {
      expect(
        matchField(el(`<label for="a">${l}</label><input type="checkbox" id="a">`))?.resumePath,
      ).toBeUndefined();
    }
  });

  it('matches the achievements textarea BOSS puts beside the duties one', () => {
    expect(path('工作业绩')).toBe('work.description');
  });

  // Every board opens a resume with this section under a different name, and
  // Resume had nowhere to put it.
  it('matches the opening pitch under all four names', () => {
    for (const l of ['个人优势', '优势内容', '优势亮点', '自我评价']) {
      expect(path(l)).toBe('basic.summary');
    }
  });
});

describe('patterns · expected versus current salary, both wordings', () => {
  const el = (html: string): Element => {
    document.body.innerHTML = html;
    return document.body.querySelector('input')!;
  };
  const path = (l: string) =>
    matchField(el(`<label for="a">${l}</label><input id="a">`))?.resumePath;

  // 期望月薪 shares no substring with 薪资, so it matched nothing at all —
  // caught by running a fill against the real control strings rather than by
  // reading the table.
  it('recognises the expectation wordings', () => {
    for (const l of ['期望薪资', '期望月薪', '期望年薪', '意向月薪', '薪资要求']) {
      expect(path(l)).toBe('jobPreference.salaryRange');
    }
  });

  it('keeps the current-salary wordings apart', () => {
    for (const l of ['当前月薪', '目前月薪', '当前薪资', '税前月薪']) {
      expect(path(l)).toBe('basic.currentSalary');
    }
  });
});
