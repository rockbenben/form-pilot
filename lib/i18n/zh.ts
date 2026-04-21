export const zh = {
  // App
  'app.name': 'FormPilot',
  'app.subtitle': '个人资料 · 自动填写 · 智能匹配',

  // Sidebar
  'nav.basic': '基本信息',
  'nav.education': '教育经历',
  'nav.work': '工作经历',
  'nav.projects': '项目经历',
  'nav.skills': '技能证书',
  'nav.jobPreference': '求职意向',
  'nav.custom': '自定义',
  'nav.settings': '设置',

  // Profile selector
  'resume.new': '+ 新资料',
  'resume.default': '资料',
  'resume.delete': '删除',
  'resume.delete.confirm': '确定删除？',
  'resume.rename': '重命名',
  'resume.hint': '点击切换 · 双击重命名',

  // Status bar
  'status.fields': '字段',
  'status.completion': '完成度',
  'status.import': '导入',
  'status.export': '导出',

  // Basic info
  'basic.title': '基本信息',
  'basic.name': '姓名',
  'basic.nameEn': '英文名',
  'basic.phone': '手机号',
  'basic.email': '邮箱',
  'basic.gender': '性别',
  'basic.birthday': '出生日期',
  'basic.nationality': '国籍',
  'basic.ethnicity': '民族',
  'basic.politicalStatus': '政治面貌',
  'basic.location': '所在城市',
  'basic.willingLocations': '意向城市',
  'basic.socialLinks': '社交链接',
  'basic.socialLinks.github': 'GitHub',
  'basic.socialLinks.linkedin': 'LinkedIn',
  'basic.socialLinks.portfolio': '个人网站',
  'settings.language.zh': '中文',
  'settings.language.en': 'English',

  // Education
  'education.title': '教育经历',
  'education.school': '学校',
  'education.schoolEn': '学校(英文)',
  'education.degree': '学位',
  'education.major': '专业',
  'education.majorEn': '专业(英文)',
  'education.gpa': 'GPA',
  'education.gpaScale': '满分',
  'education.startDate': '开始日期',
  'education.endDate': '结束日期',
  'education.honors': '荣誉奖项',

  // Work
  'work.title': '工作经历',
  'work.company': '公司',
  'work.companyEn': '公司(英文)',
  'work.jobTitle': '职位',
  'work.jobTitleEn': '职位(英文)',
  'work.department': '部门',
  'work.location': '工作地点',
  'work.startDate': '开始日期',
  'work.endDate': '结束日期',
  'work.description': '职责描述',

  // Projects
  'projects.title': '项目经历',
  'projects.name': '项目名称',
  'projects.role': '角色',
  'projects.startDate': '开始日期',
  'projects.endDate': '结束日期',
  'projects.link': '链接',
  'projects.description': '项目描述',
  'projects.techStack': '技术栈',

  // Skills
  'skills.title': '技能证书',
  'skills.languages': '编程语言 / 外语',
  'skills.frameworks': '框架',
  'skills.tools': '工具',
  'skills.certificates': '证书',

  // Job preference
  'jobPref.title': '求职意向',
  'jobPref.positions': '意向岗位',
  'jobPref.industries': '意向行业',
  'jobPref.salaryRange': '薪资范围',
  'jobPref.jobType': '工作类型',
  'jobPref.availableDate': '到岗时间',

  // Custom fields
  'custom.title': '自定义字段',
  'custom.description': '添加任意字段，用于应对平台特有的问题。',
  'custom.key': '字段名',
  'custom.value': '值',
  'custom.add': '+ 添加字段',

  // Settings
  'settings.title': '设置',
  'settings.language': '语言',
  'settings.apiProvider': 'AI 提供商',
  'settings.apiProvider.none': '不使用',
  'settings.apiKey': 'API Key',
  'settings.apiKeyHint': 'API Key 仅存储在本地，用于 AI 语义分析兜底。不填则仅使用本地规则匹配。',

  // Import dialog
  'import.title': '导入资料',
  'import.json': 'JSON 文件',
  'import.resume': 'PDF / Word',
  'import.click': '点击选择文件',
  'import.close': '关闭',
  'import.success.json': 'JSON 导入成功',
  'import.success.resume': '资料导入成功，请检查并补充信息',
  'import.error.format': '仅支持 PDF 和 DOCX 格式',
  'import.parsing': '正在解析...',

  // Array section
  'array.add': '+ 添加',
  'array.delete': '删除此项',

  // Tag field
  'tag.placeholder': '输入后按 Enter 添加',

  // Popup
  'popup.tagline': '一键投递 · 跨站复填',
  'popup.currentResume': '当前资料',
  'popup.noResume': '未创建资料',
  'popup.edit': '编辑资料',
  'popup.fill': '填写当前页面',
  'popup.fill.success': '填写完成',
  'popup.fill.error': '填写失败。如果刚安装插件或页面在安装前已打开，请刷新页面后重试',
  'popup.progress': '已填 {filled} / {total} 项（{pct}%）',
  'popup.hint.firstTime': '先在「编辑资料」里填常用信息，打开网页后点「填写当前页面」一键填入',
  'popup.settingsOpen': '打开设置',

  // Status
  'status.saving': '保存中...',
  'status.saved': '已保存',

  // Toolbar
  'toolbar.fill': '一键填写',
  'toolbar.progress': '填写进度',
  'toolbar.result': '填写结果',
  'toolbar.filled': '已填',
  'toolbar.uncertain': '需确认',
  'toolbar.unrecognized': '未识别',

  // ── Capture feature ─────────────────────────────────────────────
  'toolbar.save': '保存',

  'capture.menu.draft': '📝 保存草稿',
  'capture.menu.writeback': '↩️ 保存到资料',
  'capture.menu.memory': '🧠 记住本页表单',

  'capture.toast.draft.saved': '已保存 {n} 个字段的草稿',
  'capture.toast.draft.partial': '已保存 {n} 个，跳过 {m} 个',
  'capture.toast.writeback.done': '已保存 {n} 个字段到「{name}」',
  'capture.toast.memory.saved': '已记住本页 {n} 个字段',
  'capture.toast.nothingToWriteBack': '当前页没有可保存的字段',
  'capture.toast.noActiveResume': '请先选择一份活动资料',
  'capture.toast.storageFull': '存储空间不足，请在 Dashboard 清理',

  'capture.badge.detected': '检测到 {n} 个字段的草稿（{time}）',
  'capture.badge.restore': '恢复',
  'capture.badge.restoreAndFill': '恢复并继续填充',
  'capture.badge.ignore': '忽略',
  'capture.badge.delete': '删除',
  'capture.badge.restored': '已恢复 {filled}/{total} 个字段',

  'time.justNow': '刚刚',
  'time.minutesAgo': '{n} 分钟前',
  'time.hoursAgo': '{n} 小时前',
  'time.daysAgo': '{n} 天前',

  'nav.savedPages': '已保存页面',
  'savedPages.drafts.title': '草稿',
  'savedPages.drafts.empty': '暂无草稿',
  'savedPages.memory.title': '页面记忆',
  'savedPages.memory.empty': '暂无页面记忆',
  'savedPages.form.title': '表单记录',
  'savedPages.form.empty': '暂无跨站表单记录',
  'savedPages.form.clearAll': '全部清空',
  'savedPages.form.column.label': '字段',
  'savedPages.form.column.value': '保存值',
  'savedPages.form.column.hits': '次数',
  'savedPages.form.column.source': '来源 URL',
  'savedPages.column.url': '网址',
  'savedPages.column.savedAt': '保存时间',
  'savedPages.column.fields': '字段数',
  'savedPages.column.actions': '操作',
  'savedPages.action.view': '查看',
  'savedPages.action.delete': '删除',

  'settings.capture.title': '保存/恢复',
  'settings.capture.skipSensitive': '跳过敏感字段（身份证、验证码等）',
  'settings.capture.allowedDomains': '自动启用的域名',
  'settings.capture.allowedDomains.reset': '恢复默认',
  'settings.capture.allowedDomainsHint': '每行一个域名，也支持逗号分隔（后缀匹配，例如 mokahr.com 涵盖 jobs.mokahr.com）。不在列表里的页面不会自动出现工具栏；如果该 URL 有草稿或页面记忆，或你从 popup 点击"填写当前页面"，仍会激活。',

  // ── 多候选值选择器 ─────────────────────────────────────────
  'candidate.picker.manage': '管理全部候选 →',
  'candidate.picker.pin': '设为默认',
  'candidate.picker.unpin': '取消默认',
  'candidate.picker.delete': '删除候选',
  'candidate.picker.hitCountLabel': '{n} 次命中',
  'candidate.picker.lastSeen': '上次在 {domain}',
  'candidate.domainPref.rememberToast': '在 {domain} 下记住用「{value}」？',
  'candidate.domainPref.remember': '记住',
  'candidate.domainPref.onceOnly': '只此一次',
  'candidate.domainPref.cancel': '取消',
  'candidate.dashboard.addCandidate': '新增候选',
  'candidate.dashboard.domainOverrides': '按域名覆盖',
  'candidate.dashboard.candidatesCount': '{n} 个候选',
  'candidate.dashboard.defaultLabel': '默认：{value}',
  'candidate.dashboard.editValue': '编辑值',
  'candidate.dashboard.valuePlaceholder': '值',
  'candidate.dashboard.displayValuePlaceholder': '显示文本（select/radio 用）',
  'candidate.dashboard.save': '保存',
  'candidate.dashboard.cancel': '取消',

  // ── Profile 多值候选（Phase B）─────────────────────────────
  'profile.candidate.add': '+ 新增',
  'profile.candidate.labelPlaceholder': '标签（个人/工作）',
  'profile.candidate.valuePlaceholder.phone': '手机号',
  'profile.candidate.valuePlaceholder.email': '邮箱',
  'profile.candidate.noCandidates': '未填写',
  'profile.candidate.save': '保存',
  'profile.candidate.cancel': '取消',
};
