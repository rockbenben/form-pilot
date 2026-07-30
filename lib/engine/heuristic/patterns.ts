/**
 * Pattern map: resumePath → array of regex patterns.
 *
 * Each pattern is tested (case-insensitive) against signal strings extracted
 * from form elements. If any pattern matches, the field is considered a
 * candidate for that resume path.
 */
export const PATTERNS: Record<string, RegExp[]> = {
  // ─── Basic Info ─────────────────────────────────────────────────────────────

  'basic.name': [
    /^(full[\s_-]?name|your[\s_-]?name|applicant[\s_-]?name)$/i,
    /\b(full[\s_-]?name|real[\s_-]?name)\b/i,
    /^(姓名|真实姓名|申请人姓名|名字)$/,
    /姓\s*名/,
  ],

  'basic.nameEn': [
    /\b(english[\s_-]?name|name[\s_-]?en|en[\s_-]?name)\b/i,
    /^(英文姓名|英文名)$/,
    /英文.*名|name.*english/i,
  ],

  'basic.email': [
    /\bemail\b/i,
    /\be[\s_-]?mail\b/i,
    /\bemailaddress\b/i,
    // 邮件 on its own, so a placeholder written as 「用于接收面试邮件」 — which is
    // what one major board uses instead of a label — is recognised. Verified
    // against a live 猎聘 basic-info form, where this field matched nothing.
    /邮箱|电子邮件|邮件/,
  ],

  'basic.phone': [
    /\b(phone|mobile|cell|telephone|tel)\b/i,
    /\b(phone[\s_-]?number|mobile[\s_-]?number)\b/i,
    /手机|电话|联系方式|手机号/,
    /^\s*电话\s*$/,
  ],

  'basic.gender': [
    /\bgender\b/i,
    /\bsex\b/i,
    /性别/,
  ],

  'basic.birthday': [
    /\b(birthday|birth[\s_-]?date|date[\s_-]?of[\s_-]?birth|dob)\b/i,
    // 出生年月 is what 智联招聘 labels this field; it shares no substring with
    // 出生日期 or 生日, so the field matched nothing there. Verified on a live
    // resume form.
    /出生日期|出生年月|出生年份|生日/,
  ],

  'basic.age': [
    /^age$/i,
    /\bage\b/i,
    /^年龄$/,
    /年\s*龄/,
  ],

  'basic.nationality': [
    /\bnationality\b/i,
    /\bcitizenship\b/i,
    /国籍|籍贯/,
  ],

  'basic.ethnicity': [
    /\bethnicity\b/i,
    /\brace\b/i,
    /民族/,
  ],

  'basic.politicalStatus': [
    /\b(political[\s_-]?status|party[\s_-]?membership)\b/i,
    /政治面貌|党员|政治状况/,
  ],

  'basic.location': [
    /\b(location|city|address|current[\s_-]?city|residence)\b/i,
    /现居|所在城市|居住地|城市|地址/,
    /居住地址/,
  ],

  'basic.avatar': [
    /\b(avatar|photo|picture|headshot|profile[\s_-]?photo)\b/i,
    /照片|头像/,
  ],

  // Both 智联招聘 and BOSS 直聘 ask when you started working rather than for a
  // number of years, and derive the years from it.
  'basic.workStartDate': [
    /\b(work[\s_-]?start[\s_-]?date|first[\s_-]?job[\s_-]?date|career[\s_-]?start)\b/i,
    /参加工作时间|参加工作年月|首次工作时间|开始工作时间/,
  ],

  // Deliberately narrow. `jobPreference.salaryRange` already claims 薪资, and
  // 智联's expected-salary field is labelled 期望月薪 — matching a bare 月薪
  // here would route the expected salary into the current one.
  'basic.currentSalary': [
    /\b(current[\s_-]?salary|present[\s_-]?salary|now[\s_-]?salary)\b/i,
    /当前薪资|目前薪资|现薪资|当前月薪|目前月薪|税前月薪|目前年薪|当前年薪/,
  ],

  'basic.jobStatus': [
    /\b(job[\s_-]?status|work[\s_-]?status|employment[\s_-]?status|availability)\b/i,
    /目前状态|求职状态|工作状态|在职状态|求职情况/,
  ],

  // The opening pitch. 个人优势 (BOSS), 优势内容 / 自我评价 (智联),
  // 优势亮点 (猎聘) — the same section under four names.
  'basic.summary': [
    /\b(summary|self[\s_-]?(evaluation|introduction|assessment)|about[\s_-]?me|personal[\s_-]?statement)\b/i,
    /(selfAssess|selfEvaluation|advantage)/i,
    // 猎聘's editor gives this textarea no label at all — the only signals are
    // id=selfAssess and a placeholder reading 「请简要描述你的职业优势…」.
    /个人优势|优势内容|优势亮点|自我评价|自我介绍|个人简介|个人评价|职业亮点|职业优势/,
  ],

  'basic.socialLinks.wechat': [
    /\bwechat\b/i,
    /微信号|微信/,
  ],

  'basic.socialLinks.linkedin': [
    /linkedin/i,
    /领英/,
  ],

  'basic.socialLinks.github': [
    /github/i,
    /代码仓库/,
  ],

  'basic.socialLinks.portfolio': [
    /\b(portfolio|personal[\s_-]?website|homepage|blog)\b/i,
    /个人主页|作品集|博客|个人网站/,
  ],

  // ─── Education ──────────────────────────────────────────────────────────────

  'education.school': [
    /\b(school|university|college|institution|alma[\s_-]?mater)\b/i,
    /学校|院校|大学|毕业院校|学校名称/,
    /就读院校/,
  ],

  'education.degree': [
    /\b(degree|education[\s_-]?level|qualification)\b/i,
    /学历|学位|毕业学历/,
  ],

  'education.major': [
    /\b(major|field[\s_-]?of[\s_-]?study|discipline|specialization)\b/i,
    // 专业技能 is a skills picker, not a field of study — and `education.major`
    // sits earlier in this table, so without the guard it won the tie.
    /专业(?!技能|技术能力)|主修|所学专业/,
  ],

  'education.gpa': [
    /\b(gpa|grade[\s_-]?point|academic[\s_-]?score)\b/i,
    /绩点|GPA|成绩/,
  ],

  'education.startDate': [
    /\b(start[\s_-]?date|enrollment[\s_-]?date|from[\s_-]?date|admission[\s_-]?date)\b/i,
    /入学时间|开始时间|起始时间/,
    /在校开始/,
  ],

  'education.endDate': [
    /\b(end[\s_-]?date|graduation[\s_-]?date|expected[\s_-]?graduation|to[\s_-]?date)\b/i,
    /毕业时间|结束时间|离校时间/,
    /在校结束/,
  ],

  // ─── Work Experience ────────────────────────────────────────────────────────

  'work.company': [
    /\b(company|employer|organization|firm|enterprise)\b/i,
    /公司|单位|企业|雇主|工作单位|公司名称/,
  ],

  'work.title': [
    /\b(title|position|job[\s_-]?title|role|designation)\b/i,
    // Both guards are needed. 职位类别 / 岗位类别 are the preference-side
    // category pickers on 智联 and 猎聘, and 期望职位 / 意向岗位 are the
    // preference itself — a bare 职位 claimed all of them, and since
    // `work.title` sits earlier in this table it won the tie against
    // `jobPreference.positions`, so a fill wrote the last employer's title
    // into the field asking what job the user wants next.
    /(?<!期望|意向|求职|应聘|目标)职位(?!类别)/,
    /(?<!期望|意向|求职|应聘|目标)岗位(?!类别)/,
    /头衔|职称|工作职位/,
  ],

  'work.department': [
    /\bdepartment\b/i,
    /部门|所在部门/,
  ],

  // A work entry's dates. Only unambiguous wordings are listed: a bare
  // 开始时间 appears on education and work forms alike and stays with
  // education, where it has always gone. 猎聘's work form uses exactly that
  // bare wording, so its dates are still filled from the education entry —
  // recorded in docs/job-board-fields.md rather than guessed at here.
  'work.startDate': [
    /\b(employment[\s_-]?start|joined[\s_-]?date|hire[\s_-]?date)\b/i,
    // 在职时间 deliberately absent: it is the label BOTH halves of the range
    // share, so claiming it here filled a job's end date with its start.
    // resolveDateRange in engine.ts pairs it with the input's placeholder.
    /入职时间|到职时间|工作开始时间|任职开始|入职日期/,
  ],

  'work.endDate': [
    /\b(employment[\s_-]?end|leave[\s_-]?date|resignation[\s_-]?date)\b/i,
    /离职时间|工作结束时间|任职结束|离职日期/,
  ],

  'work.description': [
    /\b(description|responsibilities|duties|job[\s_-]?description)\b/i,
    // 职责 must not reach across into the project section: 猎聘 labels a
    // project textarea 项目职责, and work.description sits earlier in the
    // table, so it took it.
    /工作描述|工作内容|岗位职责|职责业绩|工作业绩|(?<!项目)职责/,
  ],

  // ─── Projects ───────────────────────────────────────────────────────────────

  // The bare 项目 used to sit here, and since this entry comes first in the
  // table it won every tie: on 猎聘's project form, 项目职务, 项目描述 and
  // 项目业绩 all resolved to `projects.name`, so a fill wrote the project's
  // name into every field of the section.
  'projects.name': [
    /\b(project[\s_-]?name|project[\s_-]?title)\b/i,
    /项目名称|项目(?!职务|职责|角色|描述|介绍|内容|业绩|成果|经历|时间|链接|地址|规模|背景)/,
  ],

  'projects.role': [
    /\b(project[\s_-]?role|your[\s_-]?role|role[\s_-]?in[\s_-]?project)\b/i,
    /项目角色|项目职务|担任角色|项目中的角色/,
  ],

  // Reinstated after measuring the live editors. These were removed once on the
  // conclusion that no board wording could identify a project date; 智联's
  // 「项目时间」 above 选择开始时间 / 选择结束时间 identifies one exactly, and the
  // compound resolver reads that pair. The explicit wordings below cover boards
  // that spell it out on a single line.
  'projects.startDate': [
    /(project[\s_-]?start)/i,
    /项目开始时间|项目起始时间|项目开始日期/,
  ],

  'projects.endDate': [
    /(project[\s_-]?end)/i,
    /项目结束时间|项目完成时间|项目结束日期/,
  ],

  'projects.description': [
    /\b(project[\s_-]?description|project[\s_-]?detail)\b/i,
    // 项目职责 and 项目业绩 are 猎聘's separate textareas for the same story.
    // 职责 alone belongs to work.description, so they are claimed here
    // explicitly and excluded there.
    /项目描述|项目介绍|项目内容|项目职责|项目业绩|项目成果|项目背景/,
  ],

  // ─── Skills ─────────────────────────────────────────────────────────────────

  'skills.languages': [
    /\b(programming[\s_-]?language|language[\s_-]?skill|coding[\s_-]?language)\b/i,
    /编程语言|开发语言/,
  ],

  // 猎聘's skills section is a keyword picker labelled 请选择技能 with the
  // placeholder 请输入技能关键词 — neither matched anything at all.
  'skills.tools': [
    /\b(skill|skills|expertise|proficiency)\b/i,
    /技能标签|技能关键词|专业技能|技能特长|请选择技能|掌握技能/,
  ],

  'skills.certificates': [
    /\b(certificate|certification|license|credential)\b/i,
    /证书|认证|资格证/,
  ],

  // ─── Job Preference ─────────────────────────────────────────────────────────

  'jobPreference.positions': [
    /\b(desired[\s_-]?position|target[\s_-]?position|job[\s_-]?intention|expected[\s_-]?position)\b/i,
    // 职位类别 / 岗位类别 is what 智联 and 猎聘 call the picker for the kind of
    // role you are after.
    /意向岗位|期望职位|期望岗位|求职岗位|应聘职位|职位类别|岗位类别|求职意向/,
  ],

  'jobPreference.salaryRange': [
    /\b(salary|expected[\s_-]?salary|desired[\s_-]?salary|compensation)\b/i,
    // 期望月薪 is 智联's wording and shares no substring with 薪资 — the field
    // came out unrecognized, which the end-to-end run against the real control
    // strings caught. 月薪 is only claimed here behind an expectation prefix,
    // so `basic.currentSalary` keeps 当前月薪.
    /薪资|待遇要求|薪资范围|(期望|意向|目标|要求)(月薪|年薪|薪酬)/,
  ],

  'jobPreference.jobType': [
    /\b(job[\s_-]?type|employment[\s_-]?type|work[\s_-]?type)\b/i,
    /工作类型|求职类型|全职|兼职|实习/,
  ],

  'jobPreference.availableDate': [
    /\b(available[\s_-]?date|start[\s_-]?date|earliest[\s_-]?start|onboarding[\s_-]?date)\b/i,
    /到岗时间|入职时间|可入职日期/,
  ],

  'jobPreference.industries': [
    /\b(industry|desired[\s_-]?industry|target[\s_-]?industry)\b/i,
    // 行业类别 is 智联's wording, 期望行业 是猎聘的.
    /意向行业|目标行业|期望行业|行业类别|所属行业/,
  ],
};
