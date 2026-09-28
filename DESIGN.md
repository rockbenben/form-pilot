# FormPilot Design Contract

FormPilot 的设计北极星是 **Chrome 自身的界面语言**：自动填充下拉、权限气泡、`chrome://settings`。
它是一个浏览器扩展的原生功能延伸，不是一个悬浮的第三方仪表盘。所有界面都应能被用户误认为
“Chrome 自己弹出来的”。

两套样式层共用同一份 token：

- popup / dashboard：Tailwind v4，token 定义在各自 `style.css` 的 `@theme inline` 里
  （`--fp-*` CSS 变量 + `prefers-color-scheme` 翻转）。
- 注入页面的 Shadow DOM UI：`lib/ui/tokens.ts` 导出同一组值，配 `useSystemDark()` 翻转。

## Color roles

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `--fp-surface` | `#ffffff` | `#2d2d2d` | 浮层/卡片/菜单底色 |
| `--fp-surface-2` | `#f8f9fa` | `#252525` | 页面底、分组背景 |
| `--fp-fill` | `#f1f3f4` | `#35363a` | 填充式输入框、次级按钮 |
| `--fp-fill-hover` | `#e8eaed` | `#3c4043` | hover/active 行高亮 |
| `--fp-line` | `#dadce0` | `#5f6368` | 边框、分隔线 |
| `--fp-ink` | `#202124` | `#e8eaed` | 主文本 |
| `--fp-ink-2` | `#5f6368` | `#9aa0a6` | 次文本、图标 |
| `--fp-ink-3` | `#80868b` | `#8e918f` | 提示、计数 |
| `--fp-primary` | `#1a73e8` | `#8ab4f8` | 主按钮底色 / 链接 |
| `--fp-primary-hover` | `#1967d2` | `#a8c7fa` | 主按钮 hover |
| `--fp-on-primary` | `#ffffff` | `#0b1420` | 主按钮文字 |
| `--fp-tint` | `#e8f0fe` | `rgba(138,180,248,.16)` | 信息底、选中项 |
| `--fp-on-tint` | `#1967d2` | `#8ab4f8` | 信息文字 |
| `--fp-success` | `#188038` | `#81c995` | 成功 |
| `--fp-warning` | `#b06000` | `#fdd663` | 警告文字（底 `#fef7e0` / `rgba(251,188,5,.16)`） |
| `--fp-danger` | `#d93025` | `#f28b82` | 危险/删除 |

### Fill-status vocabulary (product-owned, shared everywhere)

`lib/ui/field-status.ts` is the single source. Light: filled `#188038`,
uncertain `#b06000`, empty `#1a73e8`, unrecognized `#d93025`. Dark: `#81c995`,
`#fdd663`, `#8ab4f8`, `#f28b82`. The same four colors must name the same four
outcomes in the page highlight, the result bubble, the popup bar and the
dashboard.

## Typography

- Stack: `"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto,
  "Microsoft YaHei UI", "PingFang SC", sans-serif` — 与 Chrome 界面同族。
- 浮层基准 13px；次级说明 12px；行高 1.4–1.5。数字一律 tabular-nums。
- 不做展示级大字号：Chrome 的 UI 里没有 hero text。

## Shape & elevation

- 浮层（工具条、菜单、气泡）：`border-radius: 8px`，1px `--fp-line` 边框（菜单类）
  或无边框（气泡类），阴影 `0 1px 3px rgba(60,64,67,.30), 0 4px 8px 3px rgba(60,64,67,.15)`
  （dark 用 `rgba(0,0,0,.35/.25)`）。
- 文本按钮：pill（`border-radius: 999px`），透明底 + `--fp-primary` 文字，hover 上 `--fp-tint`。
- 主按钮：pill，`--fp-primary` 底。
- 图标按钮：28×28 圆形命中区，hover `--fp-fill`。
- 填充式输入框：`--fp-fill` 底、8px 圆角、透明边框，focus 时 2px `--fp-primary` 边框。

## Components

- **FloatingToolbar** = Chrome 的浮动 pill（如媒体控制条）：`--fp-surface` 底、
  8px 圆角、阴影；主操作是 pill 主按钮，其余为图标按钮。可拖动，但外观不暗示“窗口”。
- **SaveMenu / CloseMenu / CandidatePicker** = Chrome 自动填充下拉：行高 ~28–32px、
  hover 整行 `--fp-fill-hover`、主行 13px `--fp-ink` + 次行 12px `--fp-ink-2`、
  底部 `border-top` 后跟一条蓝色“管理…”链接行。
- **DraftBadge / ResultBubble / ToolbarToast** = Chrome 权限/保存气泡：标题 13px 加粗、
  正文 12px、右下角 pill 文本按钮组；危险操作只在确认态出现。
- **popup / dashboard** = `chrome://settings`：左导航 + 白底分组卡片、填充式字段、
  分组标题 15–16px `--fp-ink`，说明文字 `--fp-ink-2`。

## Icons

单色 inline SVG（16/20px，`--fp-ink-2`），风格对齐 Material Symbols 的 Chrome 用法。
界面文案里不出现 emoji 图标（⚡💾✅⚠️🗑★✕ 等一律替换）；`title`/`aria-label` 不受限。

## States

default / hover / **focus-visible（2px `--fp-primary` 环，禁止裸 `outline:none`）** /
active / disabled（`--fp-ink` 38% 不透明度）/ loading（文字级进度，不遮布局）/
empty / error 都要有。菜单支持 Esc 关闭与上下键遍历。

## Do / Don't

- ✅ 深浅色跟随 `prefers-color-scheme`，与 Chrome 浏览器 UI 一致。
- ✅ 新颜色先问“Chrome 在哪里用过这个”，再落 token。
- ❌ 不在组件里写死 hex —— 注入 UI 用 `tokens.ts`，页面用 `--fp-*` 类。
- ❌ 不做深色“赛博”风格；深色只是 Chrome 的深色，不是品牌色。
- ❌ 不给浮层加渐变、发光、彩色阴影。
