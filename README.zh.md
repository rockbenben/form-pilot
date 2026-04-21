<p align="center">
  <img src="public/icon/128.png" width="80" height="80" alt="FormPilot">
</p>

<h1 align="center">FormPilot</h1>

<p align="center">
  不要再一次次把同样的答案敲进每个招聘网站。<br/>
  填一次，记一辈子，在哪儿都能自动填。
</p>

<p align="center">
  <a href="#安装">安装</a> &middot;
  <a href="#能帮你什么">功能</a> &middot;
  <a href="#怎么用">使用</a> &middot;
  <a href="README.md">English</a>
</p>

---

## 你遇到的痛点

这周你要投 20 份简历。每个站都问同样的问题：姓名、手机、邮箱、现居地、学历、工作经历、性别、民族、「紧急联系人关系」…… 你把同一份简历敲 20 遍到不同的公司后台，每个的控件还长得都不一样。当你第一百次敲「未婚」的时候，你开始怀疑互联网到底怎么了。

FormPilot 替你填。

## 能帮你什么

**一键填充。** 你的资料（姓名、联系方式、教育、工作经历、求职意向）一键把一整张表单填完。覆盖 Moka、Workday、Greenhouse、BOSS 直聘、北森、拉勾、智联招聘、飞书，以及很多小的中文招聘站。

**记住你填过的每一个答案。** 在 A 站写过一次「已婚」，下次任何站再问同样的问题时，自动就填上了。跨站也认识——即使一个站存「1」代表男，另一个存「M」，只要你看到的选项文字是「男」，FormPilot 都能匹配。

**多值字段 + ▾ 切换选择器。** 有个人手机也有工作手机？有个人邮箱也有校园邮箱？FormPilot 都记着。字段旁边会出现一个小 `▾`，点开随时切换。它还会记住你在哪里用的哪个（Workday 用工作邮箱，拉勾用个人邮箱），下次自动按习惯来。

**草稿保存与恢复。** 长表单填到一半被打断？`💾 → 保存草稿`。明天回来，一键恢复。按 URL 存，保留 30 天。

**能对付奇葩控件。** 中文招聘站特别爱用自定义的 radio 库（jqradio、iCheck、Select2、问卷星）。FormPilot 像真人一样点可见的那个按钮，而不是只把隐藏 input 填了。题组标题（「性别」「民族」）即使站点没把 `<label for>` 连好也能识别。

**敏感字段默认跳过。** 身份证、验证码、密码、银行卡默认不碰。要保存也可以，在设置里按站点开启。

## 安装

**前置：** Node.js 18+，pnpm 8+

```bash
pnpm install
pnpm run build
```

### 加载到 Chrome

1. 打开 `chrome://extensions`
2. 打开右上角的「开发者模式」
3. 点「加载已解压的扩展程序」，选 `.output/chrome-mv3` 目录
4. 把图标钉在工具栏

装好了。

## 怎么用

### 第一次

点扩展图标 → **编辑资料**。填一次信息（或者直接拖进 PDF/Word 简历，让解析器帮你预填，你只改错的部分）。你可以建多份资料（中英文各一份、或者两个不同的求职方向），随时切换。

### 在招聘网站上

两种用法：

**A. 悬浮工具栏** — 在默认支持的站点（主流招聘平台都内置了），页面边上会飘一个 `[⚡ 填充]` 按钮，直接点。

**B. Popup** — 点扩展图标 → **填充当前页**。在任何站都能用。

填完每个字段会染上颜色，一眼看出哪些可信：

🟢 从资料填的 · 🟡 不太确定，建议核对 · 🔴 识别不出来，你自己填 · 🟣 上次在这个 URL 填过，自动复原 · 🩷 在别的站填过同样的问题，跨站复用 · 🩵 从草稿恢复的

### 保存、记忆、恢复

悬浮工具栏上的 `💾` 按钮有三种模式：

- **📝 保存草稿** — 整页快照。30 天内回到同一 URL，点下徽章，全部复原。
- **↩️ 保存到资料** — 把你手动改过的值推回你的资料，以后任何地方都按新的填。
- **🧠 记住本页** — 学习你的答案。下次回到这个 URL 自动填；在任何**其它站**遇到同样的问题也自动填（比如「民族」出现在一个你从没用过的新站上）。

### 多值字段（手机 / 邮箱 / 或任何你答过不止一种答案的字段）

当一个字段有多个可选答案（个人手机 + 工作手机），旁边会出现 `▾`。点开切换候选值。第一次在某个新域名切到另一个值时，会弹提示「在 workday.com 下记住用这个？」——选「记住」，以后在这个域名下就默认用这个。

所有候选值可以在 **Dashboard → 基本信息**（手机 / 邮箱）和 **Dashboard → 已保存页面 → 表单记录**（其它所有记住的答案）里管理——新增、改名、删除、设为默认。

## 开发

```bash
pnpm run dev          # HMR 开发模式，扩展自动热加载
pnpm run test         # 224 个单元测试（Vitest）
pnpm run test:watch
pnpm run build        # 正式构建到 .output/chrome-mv3
```

## 工作原理

**四阶段填充级联。** 每个字段按顺序试这几层，哪层先填上就用哪个：

| 阶段 | 知道什么 | 作用范围 |
|------|---------|---------|
| **1. 平台适配器** | 针对已知站点的硬编码规则（Moka、Workday 等） | 每个平台 |
| **2. Heuristic + 资料** | 根据 label / name / placeholder 匹配，到你的资料 | 你的资料数据 |
| **3. 页面记忆** | 这个 URL 的精确快照 | 仅此 URL |
| **4. 跨站表单记录** | 按问题签名跨站匹配 | 任何有同样问题的站 |

**数据全在你本机。** 全部存在 `chrome.storage.local`（不上云、不走 API、不离开浏览器）。只有可选的 AI 匹配 API Key 存在 `chrome.storage.session` 里。

**Shadow DOM 隔离。** 所有在页面里挂的 UI（工具栏、草稿徽章、▾ 选择器）都在 shadow root 里——宿主页的 CSS 影响不到它，它的样式也污染不到宿主页。

**SPA 感知。** `MutationObserver` + URL 轮询抓多页表单。页面切子路由时自动重新扫描。

完整的架构和存储布局见下面 [架构](#架构) 章节。要为新平台加适配器见 [添加平台适配器](#添加平台适配器)。

## 架构

```
┌─ Popup ─────────────────────────────────────────────────┐
│  活动资料、填充按钮、打开 Dashboard                      │
└──────────────┬──────────────────────────────────────────┘
               │ chrome.tabs.sendMessage
┌─ 内容脚本（每个页面一份） ──────────────────────────────┐
│                                                         │
│  悬浮工具栏：[⚡ 填充] [3/8] [💾 保存]                  │
│                          └─ 草稿 / 保存到资料            │
│                             记住本页                     │
│                                                         │
│  草稿徽章（右上角，有草稿时出现）                        │
│  [恢复] [恢复 + 填] [忽略] [删除]                        │
│                                                         │
│  候选选择器（多值字段旁边的 ▾）                          │
│  挑候选 · pin · 删除 · 打开 Dashboard                    │
│                                                         │
│  级联引擎：适配器 → Heuristic+资料 → 页面记忆            │
│            → 跨站表单记录                                │
│                                                         │
│  用颜色标记每个字段的来源                                │
│  对 jqradio / iCheck / 问卷星 做 widget-proxy 点击       │
│  SPA 切换时自动重新填充                                  │
└──────────────┬──────────────────────────────────────────┘
               │ chrome.runtime.sendMessage
┌─ 后台 Service Worker ───────────────────────────────────┐
│  资料 / 设置 CRUD · 草稿 · 页面记忆                      │
│  跨站表单记录（候选 + pin + 域名偏好）                   │
│  Profile 候选（basic.phone / email 多值）                │
│  写回（把页面值保存回你的资料）                          │
└──────────────┬──────────────────────────────────────────┘
               │ chrome.storage.local
┌─ 存储 ──────────────────────────────────────────────────┐
│  formpilot:resumes            你的资料们                 │
│  formpilot:activeResumeId     当前活动资料               │
│  formpilot:settings           工具栏位置、允许的域名     │
│  formpilot:drafts             按 URL 的草稿（30 天）     │
│  formpilot:pageMemory         按 URL 记住的填充          │
│  formpilot:formEntries        跨站候选列表               │
│  formpilot:fieldDomainPrefs   按 signature 的域名偏好    │
│  formpilot:profileDomainPrefs 每份简历的 Profile 域名偏好│
└─────────────────────────────────────────────────────────┘
```

## 添加平台适配器

如果一个站用的是标准控件库（ATS 平台通常是），你可以给它写快速硬编码规则。在 `lib/engine/adapters/my-platform.ts` 新建文件：

```typescript
import type { PlatformAdapter, FieldMapping, InputType } from './types';
import { fillElement } from '@/lib/engine/heuristic/fillers';

export const myPlatformAdapter: PlatformAdapter = {
  id: 'my-platform',
  matchUrl: /my-platform\.com/i,
  version: '1.0.0',

  scan(doc: Document): FieldMapping[] {
    // 查 form group，取 label，映射到资料路径
  },

  async fill(element: Element, value: string, fieldType: InputType): Promise<boolean> {
    return fillElement(element, value, fieldType);
  },
};
```

注册到 `lib/engine/adapters/registry.ts`，把域名加到 `lib/storage/types.ts` 的 `DEFAULT_ALLOWED_DOMAINS` 里，新装用户才会自动激活工具栏。

## 技术栈

[WXT](https://wxt.dev)（Manifest V3）· React 18 · TypeScript · Tailwind CSS · chrome.storage · pdfjs-dist · mammoth · Vitest · Playwright

## 关于 365 Open Source Project

这是 [365 Open Source Project](https://github.com/rockbenben/365opensource) 的第 008 号项目。

一人 + AI，一年做出 300+ 个开源项目。[提交你的想法 →](https://my.feishu.cn/share/base/form/shrcnI6y7rrmlSjbzkYXh6sjmzb)

## License

MIT
