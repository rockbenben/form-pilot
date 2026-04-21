<p align="center">
  <img src="public/icon/128.png" width="80" height="80" alt="FormPilot">
</p>

<h1 align="center">FormPilot</h1>

<p align="center">
  Stop typing the same answers into every job application.<br/>
  Fill once, remember forever, fill anywhere.
</p>

<p align="center">
  <a href="#install">Install</a> &middot;
  <a href="#what-it-does-for-you">What it does</a> &middot;
  <a href="#how-to-use-it">How to use</a> &middot;
  <a href="README.zh.md">中文</a>
</p>

---

## The problem

You're applying to 20 jobs this week. Every site asks the same questions: name, phone, email, city, education, work history, gender, nationality, "emergency contact relationship"... You re-type your resume into 20 different portals. Each has a slightly different widget. Every time you catch yourself typing "未婚" (unmarried) for the hundredth time you wonder why the internet is like this.

FormPilot fills it for you.

## What it does for you

**One-click fill.** Your profile (name, contact, education, work, job preferences) fills a whole form in one click. Works on Moka, Workday, Greenhouse, BOSS, Beisen, Lagou, Zhaopin, Feishu, and a lot of smaller Chinese recruiters.

**Remembers every answer you've ever typed.** Type "已婚" once on Site A. The next time any site asks the same question, it's already filled. Works across different sites even when they use different internal values for the same option (e.g. one site stores "1" for male, another stores "M" — we match on what you see).

**Multi-value fields with a picker.** Got a personal phone and a work phone? A personal email and a school email? FormPilot keeps all of them. A small ▾ appears next to the field so you can switch on the fly. It remembers which one you used where (your work email on Workday, your personal on Lagou).

**Draft save and restore.** Half-filled a long application, got interrupted? 💾 → Save Draft. Come back tomorrow, restore in one click. Per-URL, 30-day keep.

**Works without fighting weird widgets.** Chinese recruiter sites love custom radio libraries (jqradio, iCheck, Select2, wjx). FormPilot clicks the visible widget the way a user would, instead of just stuffing the hidden input. Group headings ("性别", "民族") get resolved even when the site doesn't wire `<label for>` properly.

**Sensitive fields stay untouched.** ID numbers, captchas, passwords, bank cards are skipped by default. You opt in per-site if you want those saved.

## Install

**Prerequisites:** Node.js 18+, pnpm 8+

```bash
pnpm install
pnpm run build
```

### Load into Chrome

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked**, select the `.output/chrome-mv3` folder
4. Pin the icon to your toolbar

That's it. The extension is installed.

## How to use it

### First time

Click the icon → **Edit Profile**. Fill in your info once (or drop in a PDF/Word resume and let the parser pre-fill it — you edit anything wrong). You can keep multiple profiles (English name + Chinese name, or two different job targets) and switch between them.

### On a job site

Two ways:

**A. Floating toolbar** — on supported sites (the major recruiters ship by default), a tiny `[⚡ Fill]` button floats at the edge of the page. Click it.

**B. Popup** — click the FormPilot icon → **Fill This Page**. Works on any site.

Filled fields get color-coded so you can see at a glance what's trustworthy:

🟢 filled from your profile &middot; 🟡 uncertain match, worth checking &middot; 🔴 not recognized, fill yourself &middot; 🟣 remembered from last time you were here &middot; 🩷 remembered from some other site &middot; 🩵 restored from a draft

### Save, remember, restore

FormPilot has a `💾` button in the floating toolbar with three modes:

- **📝 Save Draft** — snapshots the whole page. Come back to the same URL any day in the next 30, click the badge, everything's back.
- **↩️ Save to Profile** — pushes your manual corrections back into your profile, so next time it fills correctly everywhere.
- **🧠 Remember This Page** — learns the answers. The same URL fills automatically next time. The same *questions* on any other site also fill ("民族" on a new recruiter you've never used before).

### Multi-value fields (phone / email / anything you've answered more than one way)

When a field has more than one possible answer (your personal phone and your work phone), a small `▾` shows up next to it. Click to pick. The first time you pick a different one on a new domain, it asks "Remember on workday.com?" — say yes, and every future fill on that domain uses that choice.

You manage all your candidates in **Dashboard → Basic Info** (phone / email) and **Dashboard → Saved Pages → Form Records** (everything else you've remembered). Add, edit, rename, delete, pin a default.

## Develop

```bash
pnpm run dev          # HMR dev build, auto-reloads the extension
pnpm run test         # 224 unit tests (Vitest)
pnpm run test:watch
pnpm run build        # production build to .output/chrome-mv3
```

## What's under the hood

**Four-phase fill cascade.** Each field tries layers in order until one fills it:

| Layer | What it knows | Scope |
|-------|---------------|-------|
| **1. Platform Adapter** | Hard-coded rules for known sites (Moka, Workday…) | Per-platform |
| **2. Heuristic + Profile** | Pattern matching on label / name / placeholder → your profile | Your profile data |
| **3. Page Memory** | Snapshot of exactly this URL | This URL only |
| **4. Form Entries** | Cross-URL match by question signature | Any site with the same question |

**Storage lives on your machine.** Everything is in `chrome.storage.local` (no cloud, no API, nothing leaves your browser). Only an optional AI-matching API key goes in `chrome.storage.session`.

**Shadow-DOM isolation.** All in-page UI (toolbar, draft badge, candidate picker) is mounted inside shadow roots, so host-page CSS never touches it and the extension's styles never touch the host page.

**SPA-aware.** `MutationObserver` + URL polling catches multi-page forms. When the page swaps sub-routes, the engine re-scans.

For full architecture and storage layout, see [ARCHITECTURE.md](#architecture) below. For contributing a platform adapter, see [Adding a Platform Adapter](#adding-a-platform-adapter).

## Architecture

```
┌─ Popup ─────────────────────────────────────────────────┐
│  Active profile, Fill button, Open Dashboard            │
└──────────────┬──────────────────────────────────────────┘
               │ chrome.tabs.sendMessage
┌─ Content Script (per page) ─────────────────────────────┐
│                                                         │
│  Floating Toolbar: [⚡ Fill] [3/8] [💾 Save]            │
│                          └─ Save Draft / Save to Profile│
│                             Remember This Page          │
│                                                         │
│  Draft Badge (top-right, appears if draft exists)       │
│  [Restore] [Restore+Fill] [Ignore] [Delete]             │
│                                                         │
│  Candidate Picker (▾ next to multi-value fields)        │
│  Pick a candidate · pin · delete · open Dashboard       │
│                                                         │
│  Cascade Engine: Adapter → Heuristic+Profile → Memory   │
│                  → Form Entries (cross-URL)             │
│                                                         │
│  Highlights mark the source of each fill                │
│  Widget-proxy click-through for jqradio / iCheck / wjx  │
│  Auto-refill on SPA navigation                          │
└──────────────┬──────────────────────────────────────────┘
               │ chrome.runtime.sendMessage
┌─ Background Service Worker ─────────────────────────────┐
│  Resume / Settings CRUD · Drafts · Page Memory          │
│  Form Entries (candidates + pin + domain prefs)         │
│  Profile Candidates (basic.phone / email multi-value)   │
│  Writeback (saves page values back to your profile)     │
└──────────────┬──────────────────────────────────────────┘
               │ chrome.storage.local
┌─ Storage ───────────────────────────────────────────────┐
│  formpilot:resumes            Your profiles             │
│  formpilot:activeResumeId     Which one is active       │
│  formpilot:settings           Toolbar pos, allowed sites│
│  formpilot:drafts             Per-URL snapshots (30d)   │
│  formpilot:pageMemory         Per-URL remembered fills  │
│  formpilot:formEntries        Cross-URL candidate lists │
│  formpilot:fieldDomainPrefs   Per-sig domain overrides  │
│  formpilot:profileDomainPrefs Per-resume profile prefs  │
└─────────────────────────────────────────────────────────┘
```

## Adding a Platform Adapter

If a site has a standard widget library (ATS platforms usually do), you can hard-code fast rules for it. Put a file at `lib/engine/adapters/my-platform.ts`:

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

Register it in `lib/engine/adapters/registry.ts` and add the domain to `DEFAULT_ALLOWED_DOMAINS` in `lib/storage/types.ts` so the toolbar auto-activates.

## Tech Stack

[WXT](https://wxt.dev) (Manifest V3) · React 18 · TypeScript · Tailwind CSS · chrome.storage · pdfjs-dist · mammoth · Vitest · Playwright

## About 365 Open Source Project

This is project #008 of the [365 Open Source Project](https://github.com/rockbenben/365opensource).

One person + AI, 300+ open source projects in a year. [Submit your idea →](https://my.feishu.cn/share/base/form/shrcnI6y7rrmlSjbzkYXh6sjmzb)

## License

MIT
