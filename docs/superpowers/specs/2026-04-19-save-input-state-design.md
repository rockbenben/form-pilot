# 页面输入状态保存（Page Input State Capture）设计文档

**Date**: 2026-04-19
**Status**: Approved, ready for implementation plan
**Related**: FormPilot 主流程 `lib/engine/orchestrator.ts`

---

## 1. 背景与目标

FormPilot 当前只做一个方向：**简历 → 表单**。用户在 Dashboard 维护一份简历，扩展在招聘页面把它自动填进表单里。

本特性扩展反向能力：**表单 → 存储**，覆盖三个不同的用户场景：

| 模式 | 问题 | 解决方式 |
|------|------|---------|
| **草稿（Draft）** | 用户填到一半刷新 / 换设备 / 被 SPA 吞了 | 一键快照当前页所有输入；下次访问该 URL 时徽章提示恢复 |
| **写回简历（Write-back）** | 用户在页面上手工修正或新填了字段，希望同步回简历以备下次使用 | 把当前页能识别出 `resumePath` 的字段值全量写回活动简历 |
| **页面记忆（Page Memory）** | 平台会问「为什么想加入我们」「期望薪资」等非简历字段 | 按 URL+字段签名记住答案；下次访问同 URL 时作为 Phase 3 兜底自动填充 |

**非目标**：
- 不做跨设备同步
- 不做多版本草稿历史（只保留最新一份）
- 不弹「写回对比面板」；写回直接生效
- 不自动覆盖前两 Phase 已填的字段（页面记忆仅作兜底）

---

## 2. 用户流程

### 2.1 工具栏入口

现有浮动工具栏 `[⚡ Auto Fill] [3/8]` 右侧新增第三个按钮 `[💾]`。点击后弹出下拉菜单：

```
┌─────────────────────┐
│ 📝 保存草稿           │
│ ↩️ 写回简历           │
│ 🧠 记住本页作答       │
└─────────────────────┘
```

点击任一项触发对应模式，并在工具栏上方显示 4 秒后自动消失的 toast。

### 2.2 草稿恢复徽章

content script 启动时查询 `formpilot:drafts[normalizeUrlForDraft(url)]`，命中则在页面右上角注入徽章（独立 Shadow Root）：

```
┌──────────────────────────────────────────────┐
│ FormPilot：检测到 12 个字段的草稿（2 小时前）   │
│ [恢复] [恢复并继续填充] [忽略] [删除]      [×]  │
└──────────────────────────────────────────────┘
```

- **恢复**：复用 `fillElement()` 把快照值写回 DOM，青色 `#22d3ee` 高亮恢复字段。
- **恢复并继续填充**：先恢复，再跑 `handleFill()`；草稿字段带 `data-formpilot-restored="draft"` 标记，`orchestrateFill` 跳过它们（不覆盖用户内容）。
- **忽略**：仅关闭徽章，数据保留。
- **删除**：删除 `draft`，关闭徽章。
- **×**：等同忽略。

### 2.3 Dashboard 管理

新增「已保存页面」Tab，两个子 Tab：
- **草稿**：列出所有草稿（URL / 保存时间 / 字段数 / 操作）；操作包含「查看字段」「删除」。查看展开内联 `label: value` 列表（敏感字段已被过滤掉）。
- **页面记忆**：列出所有 URL 的记忆条数；「查看」展开 `label → value`；「删除」移除整个 URL 的记忆。

Settings Tab 新增开关：「跳过敏感字段」（默认开启）。

---

## 3. 数据模型

### 3.1 CapturedField（所有模式共用）

```typescript
// lib/capture/types.ts
export type CapturedFieldKind =
  | 'text' | 'textarea' | 'select'
  | 'radio' | 'checkbox';

export interface CapturedField {
  /** 稳定选择器：优先 `#id`，否则 tag+type+nth-of-type 路径 */
  selector: string;
  /** 同 (selector) 多实例时的页面内出现序号，从 0 开始 */
  index: number;
  kind: CapturedFieldKind;
  /** select/radio: 选中的 value；checkbox: 'true'/'false'；其余: 原始值 */
  value: string;
  /** 签名 = hash(label | name | placeholder | aria-label) */
  signature: string;
  /** 展示用标签（恢复不依赖） */
  label: string;
}
```

### 3.2 DraftSnapshot

```typescript
// lib/storage/draft-store.ts
export interface DraftSnapshot {
  url: string;          // normalizeUrlForDraft(location.href)
  savedAt: number;      // Unix ms
  fields: CapturedField[];
}

// chrome.storage.local key: 'formpilot:drafts'
// 结构: Record<normalizedUrl, DraftSnapshot>
// 策略:
//   - 同 URL 覆盖（只保留最新）
//   - 30 天未访问自动过期（读取时过滤）
```

### 3.3 PageMemory

```typescript
// lib/storage/page-memory-store.ts
export interface PageMemoryEntry {
  signature: string;
  index: number;       // 同签名多字段的页面出现序号
  kind: CapturedFieldKind;
  value: string;
  updatedAt: number;
}

// chrome.storage.local key: 'formpilot:pageMemory'
// 结构: Record<normalizedUrl, PageMemoryEntry[]>
// 策略:
//   - 完全匹配域名+路径（去 query/hash）
//   - 保存时按 (signature, index) merge（本次未出现的保留）
//   - 永不过期，手动删除
```

### 3.4 Settings 扩展

```typescript
// lib/storage/types.ts
export interface Settings {
  toolbarPosition: { x: number; y: number };
  apiKey: string;
  apiProvider: 'deepseek' | 'openai' | '';
  skipSensitive: boolean;  // NEW，默认 true
}

export const DEFAULT_SETTINGS: Settings = {
  toolbarPosition: { x: 16, y: 80 },
  apiKey: '',
  apiProvider: '',
  skipSensitive: true,
};
```

### 3.5 URL 规范化

```typescript
// lib/capture/url-key.ts
export function normalizeUrlForDraft(url: string): string {
  // 去 hash；保留 query（不同 jobId 不共享草稿）
}

export function normalizeUrlForMemory(url: string): string {
  // 去 hash；去 query（同平台同路径共享记忆）
}
```

### 3.6 敏感与大小常量

```typescript
// lib/capture/sensitive.ts
export const SENSITIVE_PATTERNS = [
  /id.?card/i, /身份证/, /bankcard/i, /银行卡/,
  /captcha/i, /verify.?code/i, /验证码/,
  /password/i, /密码/, /pin/i,
];
export const MAX_FIELD_SIZE = 50 * 1024;    // 50KB，单字段 value 超限跳过
export const MAX_TOTAL_SIZE = 500 * 1024;   // 500KB，整页总量按 value 长度倒序截断
```

敏感匹配**仅作用于** label / name / placeholder / aria-label，不匹配 value。

---

## 4. 架构与模块划分

```
┌─ Content Script ─────────────────────────────────────────┐
│                                                          │
│  FloatingToolbar                                         │
│    [⚡ Fill] [3/8] [💾 Save]                            │
│                     └─→ SaveMenu (Shadow DOM)            │
│                           ├─ 📝 saveDraft()              │
│                           ├─ ↩️ writeBack()              │
│                           └─ 🧠 savePageMemory()         │
│                                                          │
│  DraftBadge (独立 Shadow Root, top-right)                │
│    ├─ restoreDraft()                                     │
│    ├─ restoreDraft() + handleFill()                      │
│    ├─ ignoreDraft()                                      │
│    └─ deleteDraft()                                      │
│                                                          │
│  orchestrateFill (修改)                                  │
│    Phase 1: adapter                                      │
│    Phase 2: heuristic                                    │
│    Phase 3: page memory (NEW, 仅处理 unrecognized)       │
└──────────────────────────────────────────────────────────┘
           │ chrome.runtime.sendMessage
           ▼
┌─ Background Service Worker ──────────────────────────────┐
│  新增路由：                                              │
│    SAVE_DRAFT / GET_DRAFT / DELETE_DRAFT / LIST_DRAFTS   │
│    SAVE_PAGE_MEMORY / GET_PAGE_MEMORY /                  │
│      DELETE_PAGE_MEMORY / LIST_PAGE_MEMORY               │
│    WRITE_BACK_TO_RESUME                                  │
└──────────────────────────────────────────────────────────┘
           │ chrome.storage.local
           ▼
┌─ Storage ────────────────────────────────────────────────┐
│  formpilot:drafts        Record<url, DraftSnapshot>      │
│  formpilot:pageMemory    Record<url, PageMemoryEntry[]>  │
│  formpilot:resumes       (unchanged, 通过 writeback 更新)│
└──────────────────────────────────────────────────────────┘
```

### 新增模块职责

| 模块 | 职责 |
|------|------|
| `lib/capture/serializer.ts` | 遍历 document，过滤 + 序列化成 `CapturedField[]`；应用敏感 + 大小规则 |
| `lib/capture/restorer.ts` | 按 `selector + index` 反序列化写回 DOM；复用 `fillElement()` |
| `lib/capture/writeback.ts` | 调 `scanFields()` 识别 → 聚合 `Map<resumePath, string>` → `setValueInResume()` → `updateResume()` |
| `lib/capture/memory-phase.ts` | Phase 3 实现：接收 `FillResult`、当前 memory、DOM，填充未识别字段 |
| `lib/capture/sensitive.ts` | 敏感关键词匹配工具 |
| `lib/capture/url-key.ts` | URL 规范化工具 |
| `lib/capture/time-format.ts` | 相对时间格式化（纯函数，无外部依赖） |
| `lib/storage/draft-store.ts` | `saveDraft / getDraft / deleteDraft / listDrafts`；读取时过期过滤 |
| `lib/storage/page-memory-store.ts` | `savePageMemory / getPageMemory / deletePageMemory / listPageMemory` |

### 消息协议

```
SAVE_DRAFT         { url, fields }                 → { ok }
GET_DRAFT          { url }                          → { ok, data: DraftSnapshot | null }
DELETE_DRAFT       { url }                          → { ok }
LIST_DRAFTS        {}                               → { ok, data: DraftSnapshot[] }

SAVE_PAGE_MEMORY   { url, fields }                 → { ok, data: { saved: number } }
GET_PAGE_MEMORY    { url }                          → { ok, data: PageMemoryEntry[] }
DELETE_PAGE_MEMORY { url }                          → { ok }
LIST_PAGE_MEMORY   {}                               → { ok, data: Record<string, PageMemoryEntry[]> }

WRITE_BACK_TO_RESUME { pairs: Array<{resumePath, value}> }
                                                    → { ok, data: { updated: number } }
```

---

## 5. 模式详细流程

### 5.1 保存草稿

**保存（用户点 `📝 保存草稿`）**：

1. `serializeFields(document, settings)` 遍历 `<input>/<textarea>/<select>`：
   - 过滤：`hidden/submit/reset/button/image/password/file` 跳过；`readOnly/disabled` 跳过；非原生 select 的自定义下拉跳过（通过检查 `el.tagName === 'SELECT'`）。
   - 若 `skipSensitive=true` 且 label/name/placeholder/aria-label 命中 `SENSITIVE_PATTERNS` → 跳过。
   - 单字段 `value.length >= MAX_FIELD_SIZE` → 跳过，计入 `skipped` 列表。
   - 生成 `selector`：优先 `#${CSS.escape(id)}`，否则 `tagName[type]:nth-of-type(n)` 的组合路径。
   - 按 (selector 字符串) 分组，同字符串者依次分配 `index=0, 1, 2...`。
   - 同名 radio group 只保留选中那个（group 按 `name` 判断）。
2. 若 `sum(value.length) >= MAX_TOTAL_SIZE`，按 `value.length` 倒序丢弃直到 ≤ 限额。
3. 发 `SAVE_DRAFT`；background 写入 `formpilot:drafts[normalizeUrlForDraft(url)]`，**覆盖旧值**。
4. toast：`已保存 N 个字段的草稿`；若有 skipped 或截断：`N 个已保存，M 个跳过`。

**恢复（徽章点 `恢复`）**：

1. `restoreFields(document, fields)`：
   - 对每个 field，用 `document.querySelectorAll(selector)` 取到同 selector 的全部元素，按 `index` 选第 N 个。
   - 若元素不存在 → 记入 `missing` 计数，跳过。
   - 按 `kind` 分发：text/textarea → `fillElement` + 触发事件；select → 按 value 选中；radio → `checked=true` + change；checkbox → `checked=bool` + change。
   - 成功恢复的元素打标 `data-formpilot-restored="draft"`。
2. 调用 `applyFieldHighlights` 但 status 为 `'draft'` → 青色 `#22d3ee`。
3. 徽章更新文案 `已恢复 {filled}/{total} 个字段`，保留 `[×]`。

**恢复并继续填充**：先执行恢复流程；再执行 `handleFill()`。`orchestrateFill` 的 Phase 1/2 在遍历前先检查 `el.getAttribute('data-formpilot-restored') === 'draft'`，若是则跳过（避免覆盖）。

### 5.2 写回简历

**前置校验**：
- 若 `getActiveResumeId()` 为 null → toast `请先选择一份活动简历`，终止。

**流程（用户点 `↩️ 写回简历`）**：

1. `scanFields(document, adapter)` — 从 `orchestrator.ts` 抽出的纯识别函数，返回 `items: FillResultItem[]`，**不执行 fill**。
2. 遍历 items，过滤出 `status !== 'unrecognized'` 且 `resumePath !== ''` 的项：
   - 从 `item.element` 读当前 value（text/select/textarea/checkbox/radio 统一转字符串）。
   - 若 value 为空串 → 跳过。
   - 累积到 `Map<resumePath, string>`；同 `resumePath` 后写覆盖前写（实现「按页面顺序的最后一个非空值」）。
3. 转 `pairs: Array<{resumePath, value}>`，发 `WRITE_BACK_TO_RESUME`。
4. background 的 `applyWriteback(resume, pairs)`：
   - 对每个 pair，调 `setValueInResume(resume, resumePath, value)`（镜像 `getValueFromResume` 的写法）：
     - `basic.email` → `resume.basic.email = value`
     - `education[1].school` → 确保 `resume.education.length >= 2`（补空条目），写 `resume.education[1].school`
     - 无索引 `education.school` → 同 `education[0].school`
     - 数组型标量（`skills.languages` 等，当前简历中类型为 `string[]`）→ `value.split(',').map(s => s.trim()).filter(Boolean)`
5. `updateResume(activeId, patch)` 持久化。
6. toast：`已写回 N 个字段到「<name>」`；若无可写回字段：`当前页没有可写回的字段`。

**不做**：不弹对比面板；不为 unrecognized 生成 custom 条目；不修改非活动简历；不触碰 `meta.name` 等元数据。

### 5.3 页面记忆

**保存（用户点 `🧠 记住本页作答`）**：

1. `serializeFields(document, settings)`（同草稿的过滤规则）。
2. 发 `SAVE_PAGE_MEMORY`；background 合并到 `formpilot:pageMemory[normalizeUrlForMemory(url)]`：
   - 对每个新 field，按 `(signature, index)` 查找现有记忆：存在则覆盖 `value/updatedAt`，不存在则 append。
   - **不删除** 本次未出现的旧记忆。
3. toast：`已记住 N 个字段`。

**恢复（orchestrateFill Phase 3）**：

1. Phase 2 完成后，发 `GET_PAGE_MEMORY`。
2. 无命中 → 直接返回 `items`。
3. 遍历当前 `items` 中 `status === 'unrecognized'` 的项：
   - 对 item.element 计算 `signature` 和在页面内同签名字段中的 `index`。
   - 在 memory entries 中查找匹配 `(signature, index)`，命中则 `fillElement(el, entry.value, inferKind(el))`。
   - 成功时更新 item.status = `'memory'`、item.source = `'memory'`、item.confidence 设为一个标记值（例如 1.0）。
4. `applyFieldHighlights` 对 `status='memory'` 的字段应用紫色 `#a855f7`。

**不做**：不覆盖前两 Phase 已 filled/uncertain 的字段；不自动更新已存在记忆的 `updatedAt`（只在显式保存时更新）。

---

## 6. UI 规范

### 6.1 工具栏 Save 按钮

`components/toolbar/FloatingToolbar.tsx` 新增按钮，样式与现有按钮一致：
- 背景 `#4b5563`（灰）；hover `#6b7280`。
- 内容：`💾` + 可选的 `保存` 文字（默认只图标，节省空间）。
- 点击时阻止 `mousedown` 冒泡到拖拽，弹出 `SaveMenu`。

### 6.2 SaveMenu

- 绝对定位：按钮下方 4px，宽度 auto。
- 深色卡片 `#1e1e3a`，边框 `1px solid #374151`，圆角 8px。
- 每项：`padding: 8px 14px`，hover `#374151`，图标 + 文字。
- 点击外部（document mousedown）关闭。
- `无活动简历` 时「写回简历」项置灰 + title 提示。

### 6.3 DraftBadge

- 独立 Shadow Root，挂到 `document.body`。
- `position: fixed; top: 16px; right: 16px; z-index: 2147483647`。
- 深色卡片 `#1e1e3a`，圆角 8px，阴影 `0 4px 24px rgba(0,0,0,0.5)`，内边距 `10px 14px`。
- 文案行：白色 13px `FormPilot：检测到 {n} 个字段的草稿（{time}）`
- 按钮行（高 28px，gap 6px，圆角 6px，字体 12px）：
  - `恢复` — 蓝 `#3b82f6`
  - `恢复并继续填充` — 紫 `#8b5cf6`
  - `忽略` — 灰 `#374151`
  - `删除` — 红 `#dc2626`
- 右上角关闭 `[×]`，点击等同「忽略」。

### 6.4 高亮颜色扩展

`entrypoints/content.ts` 的 `applyFieldHighlights`：

```typescript
const colors: Record<string, string> = {
  filled: '0 0 0 2px #4ade80',       // 绿
  uncertain: '0 0 0 2px #f59e0b',    // 黄
  unrecognized: '0 0 0 2px #ef4444', // 红
  memory: '0 0 0 2px #a855f7',       // 紫 — 页面记忆
  draft: '0 0 0 2px #22d3ee',        // 青 — 草稿恢复
};
```

### 6.5 Dashboard 「已保存页面」Tab

`components/popup/sections/SavedPagesSection.tsx`：
- 顶部子 Tab：`草稿` / `页面记忆`。
- 表格列：网址（可截断悬浮显 full）/ 保存时间（相对）/ 字段数 / 操作。
- 草稿行：`[查看字段]` 展开内联列表；`[删除]` 二次确认。
- 页面记忆行：`[查看]` 展开 `label → value`；`[删除]`。
- 空态文案通过 i18n。

### 6.6 相对时间

`lib/capture/time-format.ts` — 纯函数：
- `< 60s` → `刚刚`
- `< 60min` → `{n} 分钟前`
- `< 24h` → `{n} 小时前`
- `< 30d` → `{n} 天前`
- 否则 `YYYY-MM-DD`

---

## 7. i18n 新增 key（中英双语）

```
capture.menu.draft               '保存草稿' / 'Save Draft'
capture.menu.writeback           '写回简历' / 'Write Back to Resume'
capture.menu.memory              '记住本页作答' / 'Remember This Page'

capture.toast.draft.saved        '已保存 {n} 个字段的草稿' / 'Saved draft with {n} fields'
capture.toast.draft.partial      '已保存 {n} 个，跳过 {m} 个' / '{n} saved, {m} skipped'
capture.toast.writeback.done     '已写回 {n} 个字段到「{name}」' / 'Wrote back {n} fields to "{name}"'
capture.toast.memory.saved       '已记住 {n} 个字段' / 'Remembered {n} fields'
capture.toast.nothingToWriteBack '当前页没有可写回的字段' / 'No fields to write back'
capture.toast.noActiveResume     '请先选择一份活动简历' / 'Please select an active resume'
capture.toast.storageFull        '存储空间不足，请在 Dashboard 清理' / 'Storage full. Clean up in Dashboard'

capture.badge.detected           '检测到 {n} 个字段的草稿（{time}）' / 'Draft with {n} fields detected ({time})'
capture.badge.restore            '恢复' / 'Restore'
capture.badge.restoreAndFill     '恢复并继续填充' / 'Restore + Auto Fill'
capture.badge.ignore             '忽略' / 'Ignore'
capture.badge.delete             '删除' / 'Delete'
capture.badge.restored           '已恢复 {filled}/{total} 个字段' / 'Restored {filled}/{total}'

time.justNow                     '刚刚' / 'just now'
time.minutesAgo                  '{n} 分钟前' / '{n} min ago'
time.hoursAgo                    '{n} 小时前' / '{n} hr ago'
time.daysAgo                     '{n} 天前' / '{n} days ago'

nav.savedPages                   '已保存页面' / 'Saved Pages'
savedPages.drafts.title          '草稿' / 'Drafts'
savedPages.drafts.empty          '暂无草稿' / 'No drafts'
savedPages.memory.title          '页面记忆' / 'Page Memory'
savedPages.memory.empty          '暂无页面记忆' / 'No saved memory'
savedPages.column.url            '网址' / 'URL'
savedPages.column.savedAt        '保存时间' / 'Saved At'
savedPages.column.fields         '字段数' / 'Fields'
savedPages.column.actions        '操作' / 'Actions'
savedPages.action.view           '查看' / 'View'
savedPages.action.delete         '删除' / 'Delete'
savedPages.action.restore        '恢复' / 'Restore'

settings.capture.title           '保存/恢复' / 'Capture'
settings.capture.skipSensitive   '跳过敏感字段（身份证、验证码等）' / 'Skip sensitive fields (ID, captcha, etc.)'

toolbar.save                     '保存' / 'Save'
```

---

## 8. 测试

Vitest，放在 `tests/lib/`。**不写 e2e**（与项目现状一致）。

### 8.1 新增测试文件

**`tests/lib/capture/serializer.test.ts`**
- 文本/textarea/select/radio/checkbox 各自正确序列化
- 同 `name` 的三个 radio 仅保留选中那一个 value（group 按 name 去重）
- 两个结构完全相同的 email 输入框分别记录，`index` 递增
- `readOnly/disabled/password/file/hidden` 被跳过
- 自定义下拉（非原生 select）被跳过
- `value.length >= 50KB` 被跳过，出现在 skipped 列表
- 整页总量 ≥ 500KB 时按 value 长度倒序截断直到 ≤ 500KB

**`tests/lib/capture/sensitive.test.ts`**
- 命中 `身份证 / idcard / captcha / 验证码 / password / pin` → 标记敏感
- `skipSensitive=true` 时跳过；`false` 时不跳过
- 仅匹配 label/name/placeholder/aria-label，不匹配 value

**`tests/lib/capture/restorer.test.ts`**
- 单字段恢复：text/textarea 触发 input+change 事件
- select 按 value 恢复
- radio：恢复时选中对应 value 的那个 radio
- checkbox：恢复布尔状态
- 页面上 DOM 已变（字段被删除）→ 跳过，返回 `restored: N/M`
- 同 `selector + index` 定位能正确命中第 2 个、第 3 个重复元素

**`tests/lib/capture/writeback.test.ts`**
- 当前页有两个 `basic.email` 输入（`a@x.com` 和 `b@y.com`）→ 最终写回 `b@y.com`
- 数组字段 `education[1].school='清华'` → `resume.education[1].school`（若数组长度不足则补空条目）
- 无索引 `education.school='北大'` → `education[0].school`
- 数组型标量 `skills.languages='JS, TS'` → split 成 `['JS', 'TS']`
- `status='unrecognized'` 的 item 被忽略
- `resumePath=''` 被忽略

**`tests/lib/storage/draft-store.test.ts`**
- save 后 get 取回相同快照
- 重复 save 同一 URL → 覆盖（只留最新）
- `savedAt` 超过 30 天 → get 返回 null；list 过滤掉
- `normalizeUrlForDraft`：去 hash、保留 query

**`tests/lib/storage/page-memory-store.test.ts`**
- save 后新 `(signature, index)` → append
- save 同 `(signature, index)` → 覆盖 value + updatedAt
- 本次未出现的记忆 → 保留
- `normalizeUrlForMemory`：去 hash、去 query

### 8.2 修改现有测试

**`tests/lib/engine/orchestrator.test.ts`** 增加 Phase 3 兜底命中记忆的用例（stub `GET_PAGE_MEMORY` 消息返回）。

---

## 9. 边界与错误处理

| 场景 | 行为 |
|------|------|
| 无活动简历点「写回简历」 | toast `请先选择一份活动简历`，终止 |
| 当前页无可写回字段 | toast `当前页没有可写回的字段` |
| `chrome.storage.local` 配额不足 | 捕获异常，toast `存储空间不足，请在 Dashboard 清理` |
| 徽章「恢复」时原字段不存在 | 按可匹配恢复，文案 `已恢复 N/M`（不隐藏徽章） |
| Phase 3 触发但 ctx invalidated | try/catch 吞掉，不影响前两 Phase 结果 |
| 极大页面（>1000 个 input）序列化慢 | 单次 querySelectorAll + 同步循环；实测 <100ms |
| DraftBadge 与 FloatingToolbar 重叠 | 徽章 top-right，工具栏默认 bottom-left；独立 Shadow Root |
| SPA 仅 hash 变 | URL 规范化忽略 hash，不重查 draft |
| SPA 路径变 | URL 变化时清除 highlight + 隐藏徽章（新 URL 触发新查询） |
| 用户未激活简历时「写回简历」菜单项 | 置灰 + title 提示 |

---

## 10. 迁移与兼容

- **Settings**：`skipSensitive` 新增字段；`getSettings()` 读取后 `{...DEFAULT_SETTINGS, ...stored}` 浅合并，旧用户自动得默认 `true`。
- **Storage**：`formpilot:drafts` / `formpilot:pageMemory` 首次访问不存在，`?? {}` 兜底。
- **Resume 数据结构**：不变。
- **现有测试**：不破坏（仅 `orchestrator.test.ts` 新增用例）。
- **消息协议**：新增路由，旧路由不变。

---

## 11. 文件清单

### 11.1 新增（15）

```
lib/capture/types.ts
lib/capture/serializer.ts
lib/capture/restorer.ts
lib/capture/writeback.ts
lib/capture/memory-phase.ts
lib/capture/sensitive.ts
lib/capture/url-key.ts
lib/capture/time-format.ts
lib/storage/draft-store.ts
lib/storage/page-memory-store.ts
components/capture/SaveMenu.tsx
components/capture/DraftBadge.tsx
components/capture/ToolbarToast.tsx
components/popup/sections/SavedPagesSection.tsx
tests/lib/capture/serializer.test.ts
tests/lib/capture/sensitive.test.ts
tests/lib/capture/restorer.test.ts
tests/lib/capture/writeback.test.ts
tests/lib/storage/draft-store.test.ts
tests/lib/storage/page-memory-store.test.ts
```

### 11.2 修改（10）

```
entrypoints/content.ts               挂载 DraftBadge；Phase 3 兜底；扩展 highlight 颜色
entrypoints/background.ts            新增 9 个消息路由
components/toolbar/FloatingToolbar.tsx   新增 [💾] 按钮 + SaveMenu
components/toolbar/mount.tsx             传递 save handlers
lib/engine/orchestrator.ts               抽 scanFields；末尾调 Phase 3
lib/storage/types.ts                     Settings 新增 skipSensitive
lib/storage/settings-store.ts            默认值扩展
lib/i18n/zh.ts & en.ts                   新增约 30 个 key
components/popup/Sidebar.tsx             新增「已保存页面」Tab
entrypoints/dashboard/...                注册新 Section
```

### 11.3 不改动

`lib/engine/heuristic/*`、`lib/engine/adapters/*`、`lib/import/*`、`scripts/*`。
