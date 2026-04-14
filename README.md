<p align="center">
  <img src="public/icon/128.png" width="80" height="80" alt="FormPilot">
</p>

<h1 align="center">FormPilot</h1>

<p align="center">
  Job application auto-fill browser extension
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="README.zh.md">中文文档</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#adding-a-platform-adapter">Extend</a>
</p>

> 365 Open Source Project #008 &middot; Auto-fill job application forms across recruitment platforms

---

Maintain your resume data locally. Auto-fill job application forms across recruitment platforms with one click. Handles text inputs, dropdowns, radio buttons, date pickers, and custom UI components.

## Why

Applying to jobs means filling the same personal info over and over on different platforms. Existing tools miss fields, break on custom dropdowns, and don't handle multi-page forms. FormPilot uses a three-layer cascade engine to solve this:

| Layer | How it works | Confidence |
|-------|-------------|-----------|
| **Platform Adapters** | Hard-coded rules for known sites (Moka, Workday...) | 1.0 |
| **Heuristic Engine** | Pattern matching on label/name/placeholder/aria signals | 0.6 - 0.95 |
| **AI Semantic** *(Phase 2)* | Local ONNX model + optional API key | varies |

Each field tries Layer 1 first, falls to Layer 2, then Layer 3. Green highlight = filled. Yellow = needs confirmation. Red = unrecognized.

## Quick Start

**Prerequisites:** Node.js >= 18, pnpm >= 8

```bash
pnpm install
pnpm run build
```

### Load into Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked** -> select `.output/chrome-mv3`
4. Pin the extension in toolbar

**Usage:**
- Click extension icon -> **Manage Resumes** -> fill in your resume data in the dashboard
- Navigate to a job application page -> click the floating **Fill** button, or use **Fill Current Page** from the popup

### Development

```bash
pnpm run dev          # HMR dev build, auto-reloads extension
pnpm run test         # 48 unit tests (Vitest)
pnpm run test:watch   # Watch mode
pnpm run build        # Production build
```

## Features

| Feature | Status |
|---------|--------|
| Resume management (multi-resume, 8 sections, CRUD) | Done |
| Full-page dashboard editor | Done |
| Popup quick actions (fill + manage) | Done |
| JSON export / import | Done |
| PDF / Word resume import (rule-based extraction) | Done |
| Heuristic engine (34 field types, CN + EN patterns) | Done |
| Form fillers (text, select, radio, checkbox, date, custom dropdown) | Done |
| Floating toolbar + status bubble (Shadow DOM isolated) | Done |
| Multi-page form detection (MutationObserver + URL polling) | Done |
| Chinese / English UI (switchable in Settings) | Done |
| Moka platform adapter | Done |
| Additional adapters (Workday, Greenhouse, BOSS, Beisen, Feishu...) | Planned |
| AI semantic analysis (ONNX Runtime Web + API key) | Planned |

## Architecture

```
┌─ Popup (quick actions) ─────────────────────────────────┐
│  Active resume status, Fill button, Open Dashboard      │
└──────────────┬──────────────────────────────────────────┘
               │ chrome.tabs.sendMessage
┌─ Content Script (per job page) ─────────────────────────┐
│                                                         │
│  ┌─ Floating Toolbar (Shadow DOM) ───┐                  │
│  │  [Fill] [3/8] [Settings]          │                  │
│  └───────────────────────────────────┘                  │
│                                                         │
│  Cascade Engine:                                        │
│    1. findAdapter(url) -> adapter.scan() + adapter.fill()│
│    2. matchField(el) -> heuristic patterns + fillers    │
│    3. (Phase 2) AI semantic fallback                    │
│                                                         │
│  applyFieldHighlights() -> green/yellow/red borders     │
│  observeFormChanges() -> auto-refill on SPA navigation  │
└──────────────┬──────────────────────────────────────────┘
               │ chrome.runtime.sendMessage
┌─ Background Service Worker ─────────────────────────────┐
│  GET_ACTIVE_RESUME | GET_SETTINGS | SAVE_TOOLBAR_POS    │
└──────────────┬──────────────────────────────────────────┘
               │ chrome.storage.local / .session
┌─ Storage ───────────────────────────────────────────────┐
│  Resumes (local)  |  Settings (local)  |  API Key (session) │
└─────────────────────────────────────────────────────────┘

┌─ Dashboard (full browser tab) ──────────────────────────┐
│  Sidebar: Basic | Education | Work | Projects | Skills  │
│           Job Pref | Custom | Settings                  │
│  Resume selector (multi-resume) + Import/Export         │
└─────────────────────────────────────────────────────────┘
```

## Project Structure

```
entrypoints/
  popup/            Quick-action popup
  dashboard/        Full-page resume editor
  background.ts     Service worker (message routing)
  content.ts        Content script (cascade engine + toolbar)
components/
  popup/            Shared UI (Sidebar, FormField, ArraySection, sections/)
  toolbar/          Floating toolbar + bubble (Shadow DOM mount)
lib/
  storage/          Resume CRUD + settings (chrome.storage)
  engine/
    orchestrator.ts Cascade dispatch (adapter -> heuristic -> unrecognized)
    heuristic/      Pattern matching + signal extraction + fillers
    adapters/       Platform-specific adapters (Moka, ...)
  import/           PDF (pdfjs-dist) + Word (mammoth) parsing
  i18n/             zh + en translations, React context
tests/
  lib/              48 unit tests across 6 files
  e2e/              Playwright setup + test form page
```

## Adding a Platform Adapter

1. Create `lib/engine/adapters/my-platform.ts`:

```typescript
import type { PlatformAdapter, FieldMapping, InputType } from './types';
import { fillElement } from '@/lib/engine/heuristic/fillers';

export const myPlatformAdapter: PlatformAdapter = {
  id: 'my-platform',
  matchUrl: /my-platform\.com/i,
  version: '1.0.0',

  scan(doc: Document): FieldMapping[] {
    // Query form groups, extract labels, map to resume paths
  },

  async fill(element: Element, value: string, fieldType: InputType): Promise<boolean> {
    return fillElement(element, value, fieldType);
  },
};
```

2. Register in `lib/engine/adapters/registry.ts`
3. Add the domain to content script matches in `entrypoints/content.ts`

## Tech Stack

[WXT](https://wxt.dev) (Manifest V3) / React 18 / TypeScript / Tailwind CSS / chrome.storage / pdfjs-dist / mammoth / Vitest / Playwright

## About 365 Open Source Project

This is project #008 of the [365 Open Source Project](https://github.com/rockbenben/365opensource).

One person + AI, 300+ open source projects in a year. [Submit your idea ->](https://my.feishu.cn/share/base/form/shrcnI6y7rrmlSjbzkYXh6sjmzb)

## License

MIT
