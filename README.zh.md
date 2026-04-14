<p align="center">
  <img src="public/icon/128.png" width="80" height="80" alt="FormPilot">
</p>

<h1 align="center">FormPilot</h1>

<p align="center">
  网申自动填写浏览器插件
</p>

<p align="center">
  <a href="README.md">English</a> &middot;
  <a href="#快速开始">快速开始</a> &middot;
  <a href="#添加平台适配器">扩展适配</a>
</p>

> 365 开源计划 #008 · 网申自动填写浏览器插件

---

本地维护详细的个人简历信息，实现不同求职平台、官网的网申界面个人信息自动填写，减轻繁琐的投简历填信息流程。

## 为什么做这个

投简历时需要在不同招聘平台反复填写相同的个人信息。现有工具无法保证每个空格都有效填写——遇到下拉菜单、自定义组件、多页表单等复杂情况容易出错。

FormPilot 通过三层级联引擎解决这个问题：

| 层级 | 工作方式 | 置信度 |
|------|---------|--------|
| **平台适配器** | 为已知平台编写专用填写规则 | 1.0 |
| **启发式引擎** | 通过 label/name/placeholder/aria 信号做模式匹配 | 0.6 - 0.95 |
| **AI 语义分析** *(开发中)* | 本地 ONNX 模型 + 可选 API Key | 动态 |

每个字段依次尝试三层。填写后颜色标记状态：绿色 = 已填、黄色 = 需确认、红色 = 未识别。

## 核心功能

- **简历管理** — 独立全页面 Dashboard，支持多份简历、8 个分类编辑区（基本信息/教育/工作/项目/技能/求职意向/自定义/设置）
- **一键填写** — 悬浮工具栏注入招聘页面，点击即填
- **多页表单** — 自动检测 SPA 页面切换和动态加载的新表单区域，重新触发填写
- **简历导入** — 支持 JSON 导入导出、PDF/Word 简历解析提取
- **数据安全** — 简历 100% 本地存储，API Key 使用 session storage（关浏览器即清除）
- **中英双语** — 设置中可切换界面语言

## 快速开始

**环境要求：** Node.js >= 18，pnpm >= 8

```bash
pnpm install
pnpm run build
```

### 加载到 Chrome

1. 打开 `chrome://extensions`
2. 右上角开启**开发者模式**
3. 点击**加载已解压的扩展程序** -> 选择 `.output/chrome-mv3` 目录
4. 固定扩展到工具栏

**使用方式：**
- 点击扩展图标 -> **管理简历** -> 在 Dashboard 中填写简历信息
- 打开招聘网站的申请页面 -> 点击页面上的悬浮**填写**按钮，或从 Popup 点击**填写当前页面**

### 开发

```bash
pnpm run dev          # 开发模式（热更新，自动重载扩展）
pnpm run test         # 运行 48 个单元测试
pnpm run test:watch   # 监听模式
pnpm run build        # 生产构建
```

## 已适配 / 计划适配平台

| 类型 | 已适配 | 计划中 |
|------|--------|--------|
| 校招 | Moka | 北森、飞书招聘 |
| 社招 | — | BOSS直聘、智联招聘、猎聘 |
| 海外 | — | Workday、Greenhouse、Lever |

未适配平台自动使用启发式引擎（Layer 2），标准 HTML 表单也能较好填写。

## 添加平台适配器

在 `lib/engine/adapters/` 下新建文件，实现 `PlatformAdapter` 接口：

1. `matchUrl` — URL 匹配规则
2. `scan()` — 扫描页面表单元素，返回字段映射
3. `fill()` — 填充单个字段（可委托给通用 `fillElement`）
4. `getFormSteps()` / `nextStep()` — 可选，处理多步表单

注册到 `lib/engine/adapters/registry.ts`，并将域名添加到 `entrypoints/content.ts` 的 matches 列表。

详细代码示例见 [English README](README.md#adding-a-platform-adapter)。

## 技术栈

[WXT](https://wxt.dev)（Manifest V3）/ React 18 / TypeScript / Tailwind CSS / chrome.storage / pdfjs-dist / mammoth / Vitest / Playwright

## 参考

- 设计灵感：[OfferLink](https://offerlink.tech)
- 设计文档：[`docs/design.md`](docs/design.md)

## 关于 365 开源计划

本项目是 [365 开源计划](https://github.com/rockbenben/365opensource) 的第 008 个项目。

一个人 + AI，一年 300+ 个开源项目。[提交你的需求 ->](https://my.feishu.cn/share/base/form/shrcnI6y7rrmlSjbzkYXh6sjmzb)

## 开源协议

MIT
