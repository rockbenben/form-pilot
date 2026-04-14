# FormPilot — 网申自动填写浏览器插件

> 维护详细的个人简历信息，实现不同求职平台、官网的网申界面个人信息自动填写，减轻繁琐的投简历填信息流程。

## 目标用户

全覆盖：国内校招应届生、国内社招求职者、海外求职者。

## 核心决策摘要

| 决策项 | 选择 |
|--------|------|
| 表单识别策略 | 混合模式：平台规则 + 启发式 + AI 兜底 |
| 数据存储 | 纯本地存储 + JSON 导出/导入 |
| 浏览器支持 | Chrome only（Manifest V3） |
| AI 调用方式 | 本地小模型默认 + 可选用户自带 API Key |
| MVP 平台范围 | 各类取 2-3 个代表验证全链路 |
| 简历维护方式 | 结构化表单 + PDF/Word 导入解析 |
| 商业模式 | 完全免费开源 |

## 架构总览

Chrome Extension Manifest V3 结构：

```
popup/          → 简历管理主界面（React + Tailwind）
background/     → Service Worker：调度三层引擎、管理本地模型
content/        → Content Script：DOM 读取与操作
  adapters/     → Layer 1：平台专用适配器
  heuristic/    → Layer 2：通用启发式引擎
  ai/           → Layer 3：AI 语义分析
storage/        → 简历数据管理（chrome.storage.local + IndexedDB）
```

### 数据流

1. 用户打开招聘页面 → content script 注入
2. 检测当前 URL → 匹配 platform adapter
3. 扫描页面表单元素 → 构建字段列表 `[{element, label, type, confidence}]`
4. 三层级联识别每个字段的语义（姓名？邮箱？学历？）
5. 从 storage 读取简历数据 → 按映射关系填入
6. 用户通过悬浮工具栏确认或修正

### 多页表单处理

Content script 监听页面 URL 变化和 DOM 变化（MutationObserver），每次检测到新表单区域就重新触发扫描-识别-填写流程。

## 简历数据模型

```typescript
interface Resume {
  meta: {
    id: string
    name: string            // 简历名称，如"前端开发"
    createdAt: number
    updatedAt: number
  }

  basic: {
    name: string
    nameEn: string
    phone: string
    email: string
    gender: string
    birthday: string              // YYYY-MM-DD
    age: number                   // 可从 birthday 自动计算，也可手动填写（部分表单直接问年龄）
    nationality: string
    ethnicity: string             // 民族（国内校招）
    politicalStatus: string       // 政治面貌（国内校招）
    location: string
    willingLocations: string[]
    avatar: string                // base64
    socialLinks: Record<string, string>  // linkedin, github, portfolio...
  }

  education: Array<{
    school: string
    schoolEn: string
    degree: string                // 本科/硕士/博士/PhD
    major: string
    majorEn: string
    gpa: string
    gpaScale: string              // 满分制，如 "4.0" "5.0"
    startDate: string
    endDate: string
    honors: string[]
  }>

  work: Array<{
    company: string
    companyEn: string
    title: string
    titleEn: string
    department: string
    startDate: string
    endDate: string
    description: string
    location: string
  }>

  projects: Array<{
    name: string
    role: string
    startDate: string
    endDate: string
    description: string
    techStack: string[]
    link: string
  }>

  skills: {
    languages: string[]           // 编程语言或外语
    frameworks: string[]
    tools: string[]
    certificates: string[]        // CET-4/6, TOEFL, PMP...
  }

  jobPreference: {
    positions: string[]
    industries: string[]
    salaryRange: string
    jobType: string               // 全职/实习/兼职
    availableDate: string
  }

  custom: Array<{ key: string; value: string }>
}
```

设计要点：
- 中英文双字段（name/nameEn）覆盖国内外场景
- 国内特有字段（政治面貌、民族）作为可选项
- `custom` 字段允许任意 key-value 应对平台特殊问题
- 支持多份简历（不同岗位方向不同版本）

## 三层级联引擎

### Layer 1：Platform Adapter

```typescript
interface FieldMapping {
  element: Element              // DOM 元素引用
  resumePath: string            // 映射到的简历字段路径，如 'basic.name'
  label: string                 // 识别出的字段标签文本
  inputType: 'text' | 'select' | 'radio' | 'checkbox' | 'date' | 'textarea' | 'custom-select'
  confidence: number            // 匹配置信度 0-1
  source: 'adapter' | 'heuristic' | 'ai'  // 哪一层识别的
}

interface StepInfo {
  index: number                 // 当前步骤序号
  total: number                 // 总步骤数
  label: string                 // 步骤名称，如"基本信息"、"教育经历"
  isActive: boolean
}

interface PlatformAdapter {
  id: string                          // 如 'moka', 'workday'
  matchUrl: RegExp | RegExp[]
  version: string

  scan(document: Document): FieldMapping[]
  fill(element: Element, value: string, fieldType: string): Promise<boolean>
  getFormSteps?(): StepInfo[]
  nextStep?(): Promise<void>
}
```

每个 adapter 对特定平台硬编码选择器和交互逻辑。例如 Moka 的下拉菜单需要先点击触发弹出层再从列表中匹配选项；Workday 的日期选择器需要特定的事件序列。

MVP 适配清单：
- 校招：Moka、北森、飞书招聘
- 社招：BOSS直聘、智联招聘、猎聘
- 海外：Workday、Greenhouse、Lever

### Layer 2：Heuristic Engine

不依赖特定平台，通过通用 HTML 模式识别字段语义。

识别信号按优先级排列：
1. `input` 的 `name`/`id` 属性 → `name="email"` → 邮箱字段
2. `label` 文本关联 → `<label>姓名</label>` → 姓名字段
3. `placeholder` 文本 → `placeholder="请输入手机号"` → 手机
4. `aria-label` / `title` 属性
5. 周围文本上下文 → 前一个 sibling 的 textContent

内置中英文关键词映射表：

```typescript
const FIELD_PATTERNS: Record<string, RegExp[]> = {
  'basic.name':  [/姓名/, /name/i, /full.?name/i, /真实姓名/],
  'basic.email': [/邮箱/, /email/i, /e-mail/i, /电子邮件/],
  'basic.phone': [/手机/, /电话/, /phone/i, /mobile/i, /tel/i],
  // ... 100+ 条规则
}
```

表单元素处理策略：
- `<input type="text/email/tel">` → 直接 setValue + 触发 input/change 事件
- `<select>` → 遍历 options 做文本模糊匹配
- `<input type="radio/checkbox">` → 按 label 文本匹配选中
- 自定义下拉组件 → 模拟点击展开 → 在弹出层中搜索匹配项
- 日期选择器 → 尝试直接写入 input，失败则模拟键盘逐段输入

### Layer 3：AI Semantic

当 Layer 2 置信度低于阈值时触发。

```typescript
interface AIAnalysisRequest {
  formContext: string       // "某公司2026校招-前端开发岗申请"
  fields: Array<{
    selector: string
    label: string
    surroundingText: string
    inputType: string
  }>
  resumeKeys: string[]      // 可用的简历字段路径
}
```

两种运行模式：
- **本地模型**（默认）：ONNX Runtime Web 加载轻量级 text embedding 模型，计算字段描述与简历 key 的语义相似度
- **远程 LLM**（可选）：用户填入 API Key 后，发送结构化 prompt 给 DeepSeek/OpenAI，可处理复杂语义（如开放式问题的自动回答）

### 级联调度逻辑

```
对每个表单字段 field:
  1. 有匹配的 platform adapter? → adapter.fill(field) → done
  2. heuristic 匹配，confidence ≥ 0.8? → 直接填写
  3. heuristic 匹配，0.5 ≤ confidence < 0.8? → 填写但标黄提示用户确认
  4. confidence < 0.5? → 触发 AI Layer
  5. AI 也无法识别? → 标红，留给用户手动填写
```

## UI 设计

### Popup：全页 Tab 管理界面

500x600 尺寸的全页布局：
- 顶部：应用名称 + 简历选择器（支持多份简历切换，如"前端开发"/"后端开发"）
- 左侧导航：基本信息、教育经历、工作经历、项目经历、技能证书、求职意向、自定义、设置
- 右侧内容区：当前分类的表单编辑界面
- 底部状态栏：字段完成度统计 + 导入/预览/保存按钮

### 网申页面：悬浮工具栏 + 气泡

Content script 在页面注入的交互元素：
- **悬浮工具栏**：页面角落的迷你工具条，包含三个按钮（一键填写 / 进度计数 / 设置），可拖拽重定位，位置通过 chrome.storage.local 记忆
- **填写反馈气泡**：填写完成后弹出摘要气泡，显示已填/需确认/未识别的字段数量，点击可展开详情
- **字段状态标记**：已填写的表单字段加绿色边框，需确认的加黄色边框，未识别的加红色边框

## 简历导入

用户上传 PDF/Word 简历的处理流程：

```
上传文件 → 提取文本 → 结构化解析 → 用户修正 → 存入本地
```

- PDF 文本提取：pdf.js（Mozilla 纯 JS 库，浏览器端运行）
- Word 文本提取：mammoth.js（.docx → HTML/文本）
- 结构化解析：
  - 本地模式：正则 + 规则提取格式明确的字段（姓名、电话、邮箱等）
  - AI 模式（有 API Key 时）：全文发给 LLM，返回结构化 JSON

## 技术栈

| 类别 | 选型 |
|------|------|
| 构建工具 | WXT（WebExtension Tooling） |
| UI 框架 | React 18 + TypeScript |
| 样式 | Tailwind CSS |
| 本地存储 | chrome.storage.local + IndexedDB |
| 本地 AI | ONNX Runtime Web |
| PDF 解析 | pdf.js |
| Word 解析 | mammoth.js |
| 测试 | Vitest + Playwright |

选 WXT 的原因：自动处理 MV3 service worker 生命周期、热更新开发体验好、内置 content script/popup 脚手架支持、同类产品（OfferNow）已验证可行。

## MVP 范围

第一版聚焦验证全链路可行性：
- Layer 1 适配 6-9 个代表平台（校招/社招/海外各 2-3 个）
- Layer 2 通用启发式引擎
- Popup 简历管理（结构化表单编辑 + PDF/Word 导入）
- 悬浮工具栏 + 一键填写 + 状态反馈
- JSON 导出/导入
- 多页表单自动检测与填写

Layer 3（AI 语义分析）作为第二阶段加入。
