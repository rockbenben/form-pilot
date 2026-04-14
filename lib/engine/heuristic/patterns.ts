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
    /邮箱|电子邮件|邮件地址/,
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
    /出生日期|生日/,
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
    /专业|主修|所学专业/,
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
    /职位|岗位|头衔|职称|工作职位/,
  ],

  'work.department': [
    /\bdepartment\b/i,
    /部门|所在部门/,
  ],

  'work.description': [
    /\b(description|responsibilities|duties|job[\s_-]?description)\b/i,
    /工作描述|工作内容|职责|岗位职责/,
  ],

  // ─── Projects ───────────────────────────────────────────────────────────────

  'projects.name': [
    /\b(project[\s_-]?name|project[\s_-]?title)\b/i,
    /项目名称|项目/,
  ],

  'projects.role': [
    /\b(project[\s_-]?role|your[\s_-]?role|role[\s_-]?in[\s_-]?project)\b/i,
    /项目角色|担任角色/,
  ],

  'projects.description': [
    /\b(project[\s_-]?description|project[\s_-]?detail)\b/i,
    /项目描述|项目介绍|项目内容/,
  ],

  // ─── Skills ─────────────────────────────────────────────────────────────────

  'skills.languages': [
    /\b(programming[\s_-]?language|language[\s_-]?skill|coding[\s_-]?language)\b/i,
    /编程语言|开发语言/,
  ],

  'skills.certificates': [
    /\b(certificate|certification|license|credential)\b/i,
    /证书|认证|资格证/,
  ],

  // ─── Job Preference ─────────────────────────────────────────────────────────

  'jobPreference.positions': [
    /\b(desired[\s_-]?position|target[\s_-]?position|job[\s_-]?intention|expected[\s_-]?position)\b/i,
    /意向岗位|期望职位|求职岗位|应聘职位/,
  ],

  'jobPreference.salaryRange': [
    /\b(salary|expected[\s_-]?salary|desired[\s_-]?salary|compensation)\b/i,
    /薪资|期望薪资|待遇要求|薪资范围/,
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
    /意向行业|目标行业/,
  ],
};
