<p align="center">
  <img src="public/icon/128.png" width="80" height="80" alt="FormPilot">
</p>

<h1 align="center">FormPilot</h1>

<p align="center">
  One-click resume apply across job boards &middot; Cross-site form memory for anything you've answered before
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="README.zh.md">中文文档</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#adding-a-platform-adapter">Extend</a>
</p>

> 365 Open Source Project #008 &middot; One profile, every ATS. Every answer you've typed, remembered. Save, restore, and auto-fill any form.

---

FormPilot is a form-filling assistant that learns as you go. Build a reusable **profile** for structured personal data, snapshot any half-filled form as a **draft**, **save page values** back into the profile, and **remember form values** per-URL or globally so the same fields fill themselves next time.

## Top use cases

- **Job applications** — one profile, every ATS. Fill your name, contact, education, work history, and job preferences across Moka, Workday, Greenhouse, BOSS, Beisen, Feishu, Lagou, Liepin, Zhaopin and more with a single click. Stop re-typing the same resume into 20 different company portals.
- **Repeat form filling** — surveys, registrations, declarations, onboarding checklists. Any form you've filled once gets remembered. The next time you hit the same question anywhere on the web ("籍贯", "民族", "紧急联系人"…) FormPilot auto-fills the answer you gave last time. Works across sites, even when internal values differ.

## Why

Filling the same personal info across different platforms is tedious. Existing tools miss fields, break on custom widget libraries (jqradio, Select2, iCheck…), and don't handle multi-page forms. FormPilot uses a four-layer cascade so nothing gets left behind:

| Phase | How it works | Scope |
|-------|-------------|-------|
| **1. Platform Adapters** | Hard-coded rules for known sites (Moka, Workday…) | Per-platform |
| **2. Heuristic + Profile** | Pattern matching on label/name/placeholder/aria → profile paths | Profile-mapped fields |
| **3. Page Memory** | Exact per-URL snapshot you captured before | This URL only |
| **4. Form Entries** | Cross-URL signature match of questions you've filled anywhere | Every site with the same question |

Each field tries Phase 1 first, falls through to the next layers. Highlight colors mark the source:

🟢 green = filled from profile &middot; 🟡 yellow = uncertain &middot; 🔴 red = unrecognized &middot; 🟣 purple = per-URL memory &middot; 🩷 pink = cross-URL form entry &middot; 🩵 cyan = restored from draft

## Quick Start

**Prerequisites:** Node.js >= 18, pnpm >= 8

```bash
pnpm install
pnpm run build
```

### Load into Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked** → select `.output/chrome-mv3`
4. Pin the extension in the toolbar

**Usage:**

- Click the extension icon → **Edit Profile** → fill in your profile data in the Dashboard
- Navigate to a form page → click the floating **Fill** button, or use **Fill Current Page** from the popup
- Use the floating **💾** menu to:
  - **📝 Save Draft** — snapshot this page so you can restore it later
  - **↩️ Save to Profile** — push your manual corrections back into the active profile
  - **🧠 Remember This Page** — memorize these form values for auto-fill here AND on any other site asking the same questions

### Activation

The floating toolbar only appears when one of these is true:

1. The current host is in your **Settings → Capture → Auto-enable on these domains** list (defaults ship with the major recruitment platforms — mokahr, zhaopin, greenhouse, etc.)
2. A saved **draft** exists for this exact URL
3. **Page memory** exists for this URL
4. You explicitly click **Fill Current Page** from the popup (lazy mount)

On unlisted pages, FormPilot stays invisible and zero-overhead until invoked.

### Development

```bash
pnpm run dev          # HMR dev build, auto-reloads extension
pnpm run test         # 149 unit tests (Vitest)
pnpm run test:watch   # Watch mode
pnpm run build        # Production build
```

## Features

| Feature | Status |
|---------|--------|
| Profile management (multi-profile, 8 sections, CRUD) | Done |
| Full-page dashboard editor | Done |
| Popup quick actions (fill + manage) | Done |
| JSON export / import | Done |
| PDF / Word profile import (rule-based extraction) | Done |
| Heuristic engine (34 field types, CN + EN patterns) | Done |
| Form fillers (text, textarea, select, radio, checkbox, date, multi-select, contenteditable, custom dropdown) | Done |
| Floating toolbar + status bubble (Shadow DOM isolated) | Done |
| Multi-page form detection (MutationObserver + URL polling) | Done |
| Chinese / English UI (switchable in Settings) | Done |
| Moka platform adapter | Done |
| **Draft save + restore** (per-URL snapshot with top-right recovery badge) | Done |
| **Save to profile** (page values → active profile, one click) | Done |
| **Per-URL page memory** (Phase 3 fallback, purple highlight) | Done |
| **Multi-value form entries** (Phase 4; keep every past answer per signature; pin / per-domain override; in-page ▾ picker) | Done |
| **Profile multi-value** (`basic.phone` / `basic.email` keep multiple candidates; pin / per-resume domain override; in-page ▾ picker on profile-filled fields) | Done |
| **Widget proxy click-through** (jqradio / iCheck / display:none inputs) | Done |
| **Group-heading label detection** (wjx, Select2, fieldset/legend) | Done |
| **Opt-in domain list** (Settings-managed auto-activation) | Done |
| **Saved Pages dashboard** (drafts, memory, form entries) | Done |
| **Sensitive field filter** (skip ID/captcha/password labels by default) | Done |
| Additional adapters (Workday, Greenhouse, BOSS, Beisen, Feishu…) | Planned |
| AI semantic analysis (ONNX Runtime Web + API key) | Planned |

## Architecture

```
┌─ Popup (quick actions) ─────────────────────────────────┐
│  Active profile status, Fill button, Open Dashboard     │
└──────────────┬──────────────────────────────────────────┘
               │ chrome.tabs.sendMessage
┌─ Content Script (per page) ─────────────────────────────┐
│                                                         │
│  ┌─ Floating Toolbar (Shadow DOM, inline) ──────┐       │
│  │  [⚡ Fill] [3/8] [💾 Save]                    │       │
│  │              └─ Save Draft / Save to Profile │       │
│  │                 Remember This Page           │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
│  ┌─ Draft Badge (shows when a draft exists) ────┐       │
│  │  [Restore] [Restore+Fill] [Ignore] [Delete]  │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
│  Cascade Engine (orchestrator + scanner):               │
│    Phase 1: findAdapter(url) → adapter.scan() + fill()  │
│    Phase 2: matchField(el) → heuristic + profile fill   │
│    Phase 3: page memory → per-URL (signature, index)    │
│    Phase 4: form entries → cross-URL signature match    │
│                                                         │
│  Widget-proxy click sync: hidden native inputs (jqradio,│
│    iCheck, etc.) trigger their visible proxy's .click() │
│    so library UI stays in sync.                         │
│                                                         │
│  Highlights: 🟢filled 🟡uncertain 🔴unrecognized        │
│              🟣memory 🩷form 🩵draft                    │
│  observeFormChanges() → auto-refill on SPA navigation   │
└──────────────┬──────────────────────────────────────────┘
               │ chrome.runtime.sendMessage
┌─ Background Service Worker ─────────────────────────────┐
│  GET_ACTIVE_RESUME | GET_SETTINGS | SAVE_TOOLBAR_POS    │
│  SAVE_DRAFT | GET_DRAFT | DELETE_DRAFT | LIST_DRAFTS    │
│  SAVE_PAGE_MEMORY → also fans out to form-store         │
│  GET_PAGE_MEMORY | DELETE_PAGE_MEMORY | LIST_PAGE_MEMORY│
│  GET_FORM_ENTRIES | DELETE_FORM_ENTRY | CLEAR_FORM…     │
│  WRITE_BACK_TO_RESUME                                   │
└──────────────┬──────────────────────────────────────────┘
               │ chrome.storage.local / .session
┌─ Storage ───────────────────────────────────────────────┐
│  formpilot:resumes         Resume CRUD                  │
│  formpilot:activeResumeId  Active resume pointer        │
│  formpilot:settings        Toolbar pos, skipSensitive,  │
│                            allowedDomains, locale       │
│  formpilot:drafts          Per-URL snapshots (30d TTL)  │
│  formpilot:pageMemory      Per-URL (signature, index)   │
│  formpilot:formEntries     Cross-URL: candidates[] per s│
│  formpilot:fieldDomainPrefs Per-sig domain overrides    │
│  formpilot:profileDomainPrefs Per-resume profile-field domain overrides │
│  chrome.storage.session    API key only                 │
└─────────────────────────────────────────────────────────┘

┌─ Dashboard (full browser tab) ──────────────────────────┐
│  Sidebar: Basic | Education | Work | Projects | Skills  │
│           Job Pref | Custom | Saved Pages | Settings    │
│  Profile selector (multi-profile) + Import/Export       │
└─────────────────────────────────────────────────────────┘
```

### Save modes

| Mode | Trigger | Key | Scope & lifetime |
|------|---------|-----|------------------|
| **Draft** | `💾 → Save Draft` | Full URL (hash stripped, query kept) | Per-URL. Top-right badge on next visit. 30-day TTL. Last-write-wins. |
| **Save to Profile** | `💾 → Save to Profile` | Profile paths recognized on the page | Immediate. Last non-empty value per path pushed into the active profile. |
| **Remember This Page** | `💾 → Remember This Page` | Two writes in one action — see below | See below |

**Remember-This-Page fans out to two layers in a single click:**

- **Page memory** — `(normalized URL) × (field signature, DOM-order index)`. Exact per-URL match. Fills as **Phase 3** on next visit to the same URL. No expiry.
- **Form entries** — per-signature list of candidates (every distinct past answer kept, not overwritten). Phase 4 fill picks via: domain override → global pin (★) → highest hitCount. Multi-candidate fields get an in-page ▾ picker so users can switch per field; picking on a new domain triggers a toast asking whether to remember the choice there. Radio/select store `displayValue` (option text) so the answer still matches when another site uses different internal values.

Sensitive fields (ID numbers, captchas, passwords, bank cards) are skipped by default. Toggle in **Settings → Capture**. Draft-restored fields get flagged so subsequent Phase 1-4 fills leave them alone.

## Project Structure

```
entrypoints/
  popup/            Quick-action popup
  dashboard/        Full-page profile editor
  background.ts     Service worker (message routing)
  content.ts        Content script (cascade + toolbar + draft badge)
components/
  popup/            Shared UI (Sidebar, FormField, sections/, SavedPages)
  toolbar/          Floating toolbar + result bubble (Shadow DOM mount)
  capture/          Save menu, toast, draft badge (Shadow DOM mount)
lib/
  storage/
    resume-store.ts      Resume CRUD
    settings-store.ts    Settings (skipSensitive, allowedDomains, ...)
    draft-store.ts       Per-URL draft snapshots, 30-day TTL, auto GC on save
    page-memory-store.ts Per-URL memory, (signature, index) merge
    form-store.ts        Cross-URL FormEntry by signature (Phase 4)
  engine/
    orchestrator.ts      Cascade dispatch (adapter → heuristic → memory → form)
    scanner.ts           Pure field identification (no DOM mutation)
    heuristic/           Pattern matching, signal extraction, fillers
    adapters/            Platform-specific adapters
  capture/
    types.ts             CapturedField, DraftSnapshot, PageMemoryEntry
    serializer.ts        DOM → CapturedField[] (filters, size limits)
    restorer.ts          CapturedField[] → DOM (selector + signature fallback)
    writeback.ts         Aggregate page values → Resume patch
    memory-phase.ts      Phase 3 per-URL fallback
    form-phase.ts        Phase 4 cross-URL signature fill
    signature.ts         hash(label | placeholder | aria-label) + group heading
    element-value.ts     Shared read-current-value helper
    sensitive.ts         Sensitive-label detection + size constants
    url-key.ts           URL normalization (draft vs memory)
    time-format.ts       Relative time formatter
    css-escape.ts        CSS.escape polyfill (shared by serializer + fillers)
    native-set.ts        React-safe .value / .checked setters
    widget-proxy.ts      Find + click visible proxies for hidden native inputs
    domain-match.ts      Hostname suffix matching for allowedDomains
  import/           PDF (pdfjs-dist) + Word (mammoth) parsing
  i18n/             zh + en translations, React context, {var} substitution
tests/
  lib/              149 unit tests across 19 files
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
3. Add the domain to `DEFAULT_ALLOWED_DOMAINS` in `lib/storage/types.ts` so the toolbar auto-activates there

## Tech Stack

[WXT](https://wxt.dev) (Manifest V3) · React 18 · TypeScript · Tailwind CSS · chrome.storage · pdfjs-dist · mammoth · Vitest · Playwright

## About 365 Open Source Project

This is project #008 of the [365 Open Source Project](https://github.com/rockbenben/365opensource).

One person + AI, 300+ open source projects in a year. [Submit your idea →](https://my.feishu.cn/share/base/form/shrcnI6y7rrmlSjbzkYXh6sjmzb)

## License

MIT
