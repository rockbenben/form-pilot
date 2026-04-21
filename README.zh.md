<p align="center">
  <img src="public/icon/128.png" width="80" height="80" alt="FormPilot">
</p>

<h1 align="center">FormPilot</h1>

<p align="center">
  一键投递简历 &middot; 任何问题只答一次，跨站自动复填
</p>

<p align="center">
  <a href="README.md">English</a> &middot;
  <a href="#快速开始">快速开始</a> &middot;
  <a href="#架构">架构</a> &middot;
  <a href="#添加平台适配器">扩展适配</a>
</p>

> 365 开源计划 #008 · 一份资料通投所有招聘网站，答过的问题再也不用重复填。保存、恢复、跨站复填任何表单。

---

FormPilot 是一个会学习的表单助手：维护结构化的**个人资料**、把**任何**填到一半的表单**快照为草稿**、把页面上的值**保存到资料**、或按 URL / 跨站**记住表单填写**，下次再遇到相同字段时自动填入。

## 最常用的两个场景

- **简历投递** — 一份资料，通投所有招聘平台。Moka、Workday、Greenhouse、BOSS、北森、飞书招聘、拉勾、猎聘、智联 …… 姓名、联系方式、教育经历、工作经历、求职意向一键填完。不用再把同一份简历往 20 家公司的网申系统里来回敲。
- **重复表单复填** — 问卷、报名、申报、入职登记。任何你填过一次的表单都会被记住。再遇到相同的题目（"籍贯"、"民族"、"紧急联系人"……），FormPilot 会把你上次填的答案自动填回去，**跨站**也行。哪怕目标网站的内部 value 不一样（"1" vs "male"），照样能命中。

## 为什么做这个

在不同平台反复填相同信息既枯燥又容易出错。现有工具往往漏填字段、无法处理自定义下拉 / 隐藏原生 input 的单选组件、也搞不定多页 SPA 表单。FormPilot 用四层级联填充流水线兜底：

| 层级 | 工作方式 | 作用范围 |
|------|---------|---------|
| **1. 平台适配器** | 为已知平台写专用规则（Moka、Workday 等） | 逐平台 |
| **2. 启发式 + 资料** | 按 label / name / placeholder / aria 信号匹配到资料字段 | 能映射到资料的字段 |
| **3. 页面记忆** | 按本 URL 的历史快照精确匹配 | 仅本 URL |
| **4. 表单记录** | 按字段签名跨站匹配你曾经填过的相同问题 | 所有有相同字段的站点 |

字段依次尝试各层。填写后按来源颜色高亮：

🟢 绿 = 资料自动 &middot; 🟡 黄 = 不确定 &middot; 🔴 红 = 未识别 &middot; 🟣 紫 = 本页记忆 &middot; 🩷 粉 = 跨站记录 &middot; 🩵 青 = 从草稿恢复

## 快速开始

**环境要求：** Node.js >= 18，pnpm >= 8

```bash
pnpm install
pnpm run build
```

### 加载到 Chrome

1. 打开 `chrome://extensions`
2. 右上角开启**开发者模式**
3. 点击**加载已解压的扩展程序** → 选择 `.output/chrome-mv3` 目录
4. 固定扩展到工具栏

**使用方式：**

- 点击扩展图标 → **编辑资料** → 在 Dashboard 中录入资料
- 打开任何表单页 → 点悬浮**填写**按钮，或从 Popup 点**填写当前页面**
- 使用悬浮工具栏 **💾** 菜单：
  - **📝 保存草稿** — 给本页拍个快照，下次可恢复
  - **↩️ 保存到资料** — 把页面上手动修正的值保存回活动资料
  - **🧠 记住本页表单** — 既存本 URL 精确记忆，又存跨站通用记录（一键双层）

### 激活条件

悬浮工具栏**不会在所有页面出现**。以下任一条件满足才激活：

1. 当前域名命中你在 **设置 → 保存/恢复 → 自动启用的域名** 里配置的列表（默认包含主流招聘平台：mokahr、zhaopin、greenhouse 等）
2. 本 URL 有已保存的**草稿**
3. 本 URL 有**页面记忆**
4. 你从 popup 点「**填写当前页面**」手动触发（懒加载挂载）

白名单外的页面上，内容脚本保持沉默，零开销。

### 开发

```bash
pnpm run dev          # 热更新开发模式
pnpm run test         # 149 个单元测试（Vitest）
pnpm run test:watch   # 监听模式
pnpm run build        # 生产构建
```

## 核心功能

| 功能 | 状态 |
|------|------|
| 资料管理（多份资料、8 个分类、CRUD） | ✅ |
| 全页面 Dashboard 编辑器 | ✅ |
| Popup 快捷操作（填写 + 管理） | ✅ |
| JSON 导入导出 | ✅ |
| PDF / Word 资料解析导入 | ✅ |
| 启发式引擎（34 种字段类型、中英双语 pattern） | ✅ |
| 字段填充器（text / textarea / select / radio / checkbox / date / 多选、contenteditable、自定义下拉） | ✅ |
| 悬浮工具栏 + 状态气泡（Shadow DOM 样式隔离） | ✅ |
| 多页表单检测（MutationObserver + URL 轮询） | ✅ |
| 中英双语 UI（设置中切换） | ✅ |
| Moka 平台适配器 | ✅ |
| **保存草稿 + 恢复**（按 URL 快照 + 右上角恢复徽章） | ✅ |
| **保存到资料**（页面值 → 活动资料，一键全量） | ✅ |
| **本页记忆**（Phase 3 兜底，紫色高亮） | ✅ |
| **多值表单记录**（Phase 4；同一字段的历史答案全部保留；可 pin / 按域名覆盖；页面内 ▾ 选择器） | Done |
| **Profile 多值**（`basic.phone` / `basic.email` 多候选；可 pin / 按域名覆盖（按简历分）；页面内 ▾ 选择器） | Done |
| **隐藏 input 代理点击**（jqradio / iCheck / display:none） | ✅ |
| **题组 label 识别**（问卷星、Select2、fieldset/legend） | ✅ |
| **域名白名单**（Settings 管理的自动激活范围） | ✅ |
| **已保存页面 Dashboard**（草稿 / 记忆 / 跨站记录） | ✅ |
| **敏感字段过滤**（默认跳过身份证、验证码、密码等） | ✅ |
| 更多平台适配（Workday、Greenhouse、BOSS、北森、飞书…） | 计划中 |
| AI 语义分析（ONNX Runtime Web + API Key） | 计划中 |

## 架构

```
┌─ Popup（快捷操作） ─────────────────────────────────────┐
│  当前资料状态、填写按钮、打开 Dashboard                 │
└──────────────┬──────────────────────────────────────────┘
               │ chrome.tabs.sendMessage
┌─ Content Script（每个页面） ────────────────────────────┐
│                                                         │
│  ┌─ 悬浮工具栏（Shadow DOM、inline 挂载）───────┐       │
│  │  [⚡ 填写] [3/8] [💾 保存]                    │       │
│  │              └─ 保存草稿 / 保存到资料 /      │       │
│  │                 记住本页表单                 │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
│  ┌─ 草稿徽章（URL 有草稿时出现）────────────────┐       │
│  │  [恢复] [恢复并继续填充] [忽略] [删除]       │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
│  级联填充引擎（orchestrator + scanner）：               │
│    Phase 1：findAdapter(url) → 适配器 scan + fill       │
│    Phase 2：matchField(el) → 启发式 + 资料填入          │
│    Phase 3：页面记忆 → 本 URL 精确匹配                  │
│    Phase 4：表单记录 → 按签名跨站匹配                   │
│                                                         │
│  隐藏 input 代理同步：jqradio / iCheck 等把原生         │
│    input 设 display:none 时，触发兄弟可见元素的 click   │
│    让组件库自己的 handler 同步 UI                       │
│                                                         │
│  高亮：🟢已填 🟡不确定 🔴未识别                         │
│        🟣本页记忆 🩷跨站记录 🩵草稿恢复                 │
│  observeFormChanges() → SPA 路由切换后自动重填          │
└──────────────┬──────────────────────────────────────────┘
               │ chrome.runtime.sendMessage
┌─ Background Service Worker ─────────────────────────────┐
│  GET_ACTIVE_RESUME | GET_SETTINGS | SAVE_TOOLBAR_POS    │
│  SAVE_DRAFT | GET_DRAFT | DELETE_DRAFT | LIST_DRAFTS    │
│  SAVE_PAGE_MEMORY → 同时写入 form-store                 │
│  GET_PAGE_MEMORY | DELETE_PAGE_MEMORY | LIST_PAGE_MEMORY│
│  GET_FORM_ENTRIES | DELETE_FORM_ENTRY | CLEAR_FORM…     │
│  WRITE_BACK_TO_RESUME                                   │
└──────────────┬──────────────────────────────────────────┘
               │ chrome.storage.local / .session
┌─ 存储 ───────────────────────────────────────────────────┐
│  formpilot:resumes         资料 CRUD                     │
│  formpilot:activeResumeId  活动资料指针                  │
│  formpilot:settings        工具栏位置、敏感过滤、         │
│                            allowedDomains、locale 等     │
│  formpilot:drafts          按 URL 草稿（30 天 TTL）      │
│  formpilot:pageMemory      按 URL × (签名, index)        │
│  formpilot:formEntries     跨 URL 候选列表 per signature │
│  formpilot:fieldDomainPrefs 按 signature 的 domain 覆盖  │
│  formpilot:profileDomainPrefs 每份简历的 Profile 字段域名覆盖记录  │
│  chrome.storage.session    仅 API Key                    │
└──────────────────────────────────────────────────────────┘

┌─ Dashboard（独立浏览器 Tab） ───────────────────────────┐
│  侧栏：基本信息 | 教育 | 工作 | 项目 | 技能 |           │
│        求职意向 | 自定义 | 已保存页面 | 设置            │
│  顶部资料选择器（多份资料）+ 导入导出                    │
└──────────────────────────────────────────────────────────┘
```

### 保存模式对比

| 模式 | 触发 | 键 | 作用范围与寿命 |
|------|------|---|--------------|
| **草稿** | `💾 → 保存草稿` | 完整 URL（去 hash，保留 query） | 按 URL。下次访问时右上角徽章提示。30 天 TTL，最新覆盖。 |
| **保存到资料** | `💾 → 保存到资料` | 页面上能识别到的资料路径 | 立刻生效。每条路径最后一个非空值推入活动资料。 |
| **记住本页表单** | `💾 → 记住本页表单` | 一键双写，见下方说明 | 见下方 |

**「记住本页表单」一键双写两层：**

- **页面记忆** — `(归一化 URL) × (字段签名, DOM 顺序 index)`。精确同 URL 匹配。下次访问**同 URL** 时作为 **Phase 3** 自动填入，永不过期。
- **Form entries（跨 URL 候选）** —— 每个 signature 保留一份候选列表（历史答案全部保留，不会互相覆盖）。Phase 4 填充按：域名覆盖 → 全局 pin（★）→ hitCount 最高 挑选。多候选字段在页面上会出现 ▾ 选择器供用户临时切换；首次在某个新域名切换时，会弹 toast 问是否"在该域名下记住"。Radio/select 存 `displayValue`（可见选项文字），另一个站点用不同内部 value 时仍可匹配。

敏感字段（身份证、验证码、密码、银行卡）默认跳过，**设置 → 保存/恢复** 里可开关。草稿恢复的字段会被打标，后续 Phase 1-4 都不会再覆盖它。

## 项目结构

```
entrypoints/
  popup/            快捷操作 popup
  dashboard/        全页面资料编辑器
  background.ts     Service worker（消息路由）
  content.ts        内容脚本（级联 + 工具栏 + 草稿徽章）
components/
  popup/            共享 UI（Sidebar、FormField、sections/、SavedPages）
  toolbar/          悬浮工具栏 + 结果气泡（Shadow DOM 挂载）
  capture/          保存菜单、toast、草稿徽章（Shadow DOM 挂载）
lib/
  storage/
    resume-store.ts      资料 CRUD
    settings-store.ts    设置（skipSensitive、allowedDomains 等）
    draft-store.ts       按 URL 草稿快照，30 天 TTL，保存时顺带 GC
    page-memory-store.ts 按 URL 记忆，(签名, index) merge
    form-store.ts        按签名跨站记录 FormEntry（Phase 4）
  engine/
    orchestrator.ts      级联分发（adapter → heuristic → memory → form）
    scanner.ts           纯字段识别（不改 DOM）
    heuristic/           模式匹配、信号抽取、fillers
    adapters/            平台适配器
  capture/
    types.ts             CapturedField、DraftSnapshot、PageMemoryEntry
    serializer.ts        DOM → CapturedField[]（过滤、体积限制）
    restorer.ts          CapturedField[] → DOM（selector + 签名兜底）
    writeback.ts         页面值聚合 → 资料 patch
    memory-phase.ts      Phase 3 按 URL 兜底
    form-phase.ts        Phase 4 按签名跨站填充
    signature.ts         hash(label|placeholder|aria) + 题组 heading 查找
    element-value.ts     共享 "读当前值" 工具
    sensitive.ts         敏感 label 识别 + 体积常量
    url-key.ts           URL 归一化（草稿 vs 记忆）
    time-format.ts       相对时间格式化
    css-escape.ts        CSS.escape polyfill（serializer + fillers 共用）
    native-set.ts        React 友好的 .value / .checked 原生 setter
    widget-proxy.ts      给 display:none 的原生 input 找可见代理并点击
    domain-match.ts      域名后缀匹配（allowedDomains）
  import/           PDF（pdfjs-dist）+ Word（mammoth）解析
  i18n/             zh + en 翻译，React Context，{var} 占位符替换
tests/
  lib/              149 个单元测试，分布在 19 个文件
  e2e/              Playwright 脚手架 + 测试表单页
```

## 添加平台适配器

在 `lib/engine/adapters/` 下新建文件，实现 `PlatformAdapter` 接口：

1. `matchUrl` — URL 匹配规则
2. `scan()` — 扫描页面表单元素，返回字段映射
3. `fill()` — 填充单个字段（可委托给通用 `fillElement`）
4. `getFormSteps()` / `nextStep()` — 可选，处理多步表单

注册到 `lib/engine/adapters/registry.ts`，并把域名加到 `lib/storage/types.ts` 的 `DEFAULT_ALLOWED_DOMAINS` 里，新装用户才会自动激活工具栏。

详细代码示例见 [English README](README.md#adding-a-platform-adapter)。

## 技术栈

[WXT](https://wxt.dev)（Manifest V3）· React 18 · TypeScript · Tailwind CSS · chrome.storage · pdfjs-dist · mammoth · Vitest · Playwright

## 参考

- 设计灵感：[OfferLink](https://offerlink.tech)
- 设计文档：[`docs/design.md`](docs/design.md)

## 关于 365 开源计划

本项目是 [365 开源计划](https://github.com/rockbenben/365opensource) 的第 008 个项目。

一个人 + AI，一年 300+ 个开源项目。[提交你的需求 →](https://my.feishu.cn/share/base/form/shrcnI6y7rrmlSjbzkYXh6sjmzb)

## 开源协议

MIT
