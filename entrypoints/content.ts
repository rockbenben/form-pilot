import { findAdapter } from '@/lib/engine/adapters/registry';
import { orchestrateFill } from '@/lib/engine/orchestrator';
import type { FillResult } from '@/lib/engine/adapters/types';
import type { Resume, Settings } from '@/lib/storage/types';
import { DEFAULT_ALLOWED_DOMAINS, createEmptyResume } from '@/lib/storage/types';
import type { DraftSnapshot, PageMemoryEntry } from '@/lib/capture/types';
import type { FormEntry } from '@/lib/storage/form-store';
import { mountToolbar } from '@/components/toolbar/mount';
import { mountDraftBadge } from '@/components/capture/mount-badge';
import { serializeFields } from '@/lib/capture/serializer';
import { restoreFields } from '@/lib/capture/restorer';
import { scanFields } from '@/lib/engine/scanner';
import { collectWriteBack } from '@/lib/capture/writeback';
import { normalizeUrlForDraft, normalizeUrlForMemory } from '@/lib/capture/url-key';
import { matchesAllowedDomain, safeHostname } from '@/lib/capture/domain-match';
import { normalizeDomain, type FieldDomainPrefs } from '@/lib/storage/domain-prefs-store';
import { makeT } from '@/lib/i18n';
import { computeSignatureFor } from '@/lib/capture/signature';
import { fillElement } from '@/lib/engine/heuristic/fillers';
import { mountCandidatePicker, type MountedCandidatePicker } from '@/components/capture/mount-candidate-picker';

export default defineContentScript({
  // Injection is scoped by the in-script form-element gate below (> 3 inputs);
  // matching broadly keeps the extension usable on generic form sites
  // (问卷星, 金数据, 腾讯文档表单, Google Forms, ATS pages that don't match
  // the narrower host list we used to ship). Non-form pages exit before
  // mounting anything.
  matches: ['http://*/*', 'https://*/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    await new Promise((r) => setTimeout(r, 1000));

    // Count contenteditable surfaces as form elements too, so pages that are
    // mostly rich-text editors / comment boxes still pass the activation gate.
    // `[contenteditable]:not([contenteditable="false"])` catches true, empty,
    // and plaintext-only without enumerating each.
    const hasFormElements =
      document.querySelectorAll(
        'input, select, textarea, [contenteditable]:not([contenteditable="false"])',
      ).length > 3;
    if (!hasFormElements) return;

    // Load settings
    let settings: Settings | null = null;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (res?.ok) settings = res.data as Settings;
    } catch { /* use defaults */ }

    const stored = await chrome.storage.local.get('formpilot:locale');
    const locale = (stored['formpilot:locale'] === 'en') ? 'en' : 'zh';
    const t = makeT(locale);

    const DEFAULT_POSITION = { x: 16, y: 80 };
    const initialPosition = settings?.toolbarPosition ?? DEFAULT_POSITION;
    const skipSensitive = settings?.skipSensitive ?? true;

    // Cache active-resume presence (refreshed on fetch)
    let hasActive = false;

    async function fetchActiveResume(): Promise<Resume | null> {
      try {
        const res = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_RESUME' });
        if (res?.ok) {
          hasActive = !!res.data;
          return res.data as Resume | null;
        }
      } catch { /* ignore */ }
      return null;
    }

    interface FillContext {
      resume: Resume | null;
      memory: PageMemoryEntry[];
      formEntries: Record<string, FormEntry>;
      domainPrefs: FieldDomainPrefs;
      currentDomain: string;
    }

    /**
     * Batched fetch for handleFill — one IPC round-trip instead of three.
     * Background resolves the active resume, per-URL memory, and the global
     * form-entries map in parallel.
     */
    async function fetchFillContext(): Promise<FillContext> {
      const currentDomain = normalizeDomain(window.location.hostname);
      try {
        const res = await chrome.runtime.sendMessage({
          type: 'GET_FILL_CONTEXT',
          memoryUrl: normalizeUrlForMemory(window.location.href),
          pageDomain: currentDomain,
        });
        if (res?.ok) {
          const data = res.data as FillContext;
          hasActive = !!data.resume;
          return {
            resume: data.resume,
            memory: data.memory ?? [],
            formEntries: data.formEntries ?? {},
            domainPrefs: data.domainPrefs ?? {},
            currentDomain: data.currentDomain || currentDomain,
          };
        }
      } catch { /* ignore */ }
      return {
        resume: null,
        memory: [],
        formEntries: {},
        domainPrefs: {},
        currentDomain,
      };
    }

    // ── Fill handler ────────────────────────────────────────────────────────
    async function handleFill(): Promise<FillResult> {
      const empty: FillResult = { items: [], filled: 0, uncertain: 0, unrecognized: 0 };
      // Unmount any pickers from a previous fill before starting a new one.
      for (const p of mountedPickers) { try { p.unmount(); } catch { /* ignore */ } }
      mountedPickers = [];
      try {
        const { resume, memory, formEntries, domainPrefs, currentDomain } = await fetchFillContext();
        const adapter = findAdapter(window.location.href);
        // A missing resume is fine — memory + form entries still let us fill.
        const effectiveResume = resume ?? createEmptyResume('_', '_');
        const result = await orchestrateFill(
          document,
          effectiveResume,
          adapter,
          memory,
          formEntries,
          domainPrefs,
          currentDomain,
        );
        applyFieldHighlights(result);
        // Fire-and-forget BUMP_FORM_HIT for every Phase 4 fill.
        const hits = result.formHits ?? [];
        for (const hit of hits) {
          chrome.runtime.sendMessage({
            type: 'BUMP_FORM_HIT',
            signature: hit.signature,
            candidateId: hit.candidateId,
            sourceUrl: window.location.href,
          });
        }

        // Mount a ▾ picker beside every multi-candidate Phase 4 field.
        for (const it of result.items) {
          if (it.source !== 'form') continue;
          if (!it.element) continue;
          const sig = computeSignatureFor(it.element);
          const entry = formEntries[sig];
          if (!entry) continue;
          if (entry.kind === 'checkbox') continue;
          if (entry.candidates.length < 2) continue;

          const currentCandidateId = hits.find((h) => h.signature === sig)?.candidateId ?? null;

          let picker: MountedCandidatePicker;
          picker = mountCandidatePicker({
            target: it.element,
            signature: sig,
            t,
            candidates: entry.candidates,
            pinnedId: entry.pinnedId,
            currentCandidateId,
            onSelect: async (cid) => {
              const picked = entry.candidates.find((c) => c.id === cid);
              if (!picked) return;
              const val = picked.displayValue && picked.displayValue.length > 0 ? picked.displayValue : picked.value;
              try {
                await fillElement(it.element as Element, val, entry.kind);
              } catch { /* ignore */ }
              chrome.runtime.sendMessage({
                type: 'BUMP_FORM_HIT',
                signature: sig,
                candidateId: cid,
                sourceUrl: window.location.href,
              });
              // First switch in this session for (sig, domain) → ask whether to remember.
              const promptKey = `${sig}:${currentDomain}`;
              if (!promptedDomainPrefs.has(promptKey)) {
                promptedDomainPrefs.add(promptKey);
                const msg = t('candidate.domainPref.rememberToast', { domain: currentDomain, value: val });
                if (window.confirm(msg)) {
                  chrome.runtime.sendMessage({
                    type: 'SET_DOMAIN_PREF',
                    signature: sig,
                    domain: currentDomain,
                    candidateId: cid,
                  });
                }
              }
            },
            onPinToggle: async (cid) => {
              const next = entry.pinnedId === cid ? null : cid;
              await chrome.runtime.sendMessage({ type: 'SET_FORM_PIN', signature: sig, candidateId: next });
              entry.pinnedId = next;
              picker.update({ pinnedId: next });
            },
            onDelete: async (cid) => {
              await chrome.runtime.sendMessage({ type: 'DELETE_FORM_CANDIDATE', signature: sig, candidateId: cid });
              entry.candidates = entry.candidates.filter((c) => c.id !== cid);
              picker.update({ candidates: entry.candidates, pinnedId: entry.pinnedId });
              // If this entry now has < 2 candidates, unmount the picker entirely.
              if (entry.candidates.length < 2) {
                const idx = mountedPickers.indexOf(picker);
                if (idx >= 0) mountedPickers.splice(idx, 1);
                picker.unmount();
              }
            },
            onManageAll: () => {
              const url = chrome.runtime.getURL('/dashboard.html') + '#savedPages';
              window.open(url, '_blank');
            },
          });
          mountedPickers.push(picker);
        }

        return result;
      } catch {
        // Any unexpected throw from the cascade engine, adapter, or messaging
        // layer must not crash the content script; a benign empty result keeps
        // the toolbar usable.
        return empty;
      }
    }

    // ── Save-mode handlers ──────────────────────────────────────────────────
    async function handleSaveDraft(): Promise<{ ok: boolean; msg: string }> {
      const { fields, skipped } = serializeFields(document, { skipSensitive });
      try {
        const res = await chrome.runtime.sendMessage({
          type: 'SAVE_DRAFT',
          url: normalizeUrlForDraft(window.location.href),
          fields,
        });
        if (!res?.ok) return { ok: false, msg: t('capture.toast.storageFull') };
        // Invalidate the badge so the next refresh pulls the fresh snapshot
        // (field count, timestamp, button targets). Without this, a user who
        // saves a second draft on the same URL still sees the prior badge.
        badge?.unmount();
        badge = null;
        badgeUrl = null;
        refreshDraftBadge().catch(() => { /* ignore */ });
        const msg = skipped > 0
          ? t('capture.toast.draft.partial', { n: fields.length, m: skipped })
          : t('capture.toast.draft.saved', { n: fields.length });
        return { ok: true, msg };
      } catch {
        return { ok: false, msg: t('capture.toast.storageFull') };
      }
    }

    async function handleWriteBack(): Promise<{ ok: boolean; msg: string }> {
      const resume = await fetchActiveResume();
      if (!resume) return { ok: false, msg: t('capture.toast.noActiveResume') };
      const adapter = findAdapter(window.location.href);
      const items = await scanFields(document, adapter);
      const pairs = collectWriteBack(items);
      if (pairs.length === 0) return { ok: false, msg: t('capture.toast.nothingToWriteBack') };
      const res = await chrome.runtime.sendMessage({ type: 'WRITE_BACK_TO_RESUME', pairs, sourceUrl: window.location.href });
      if (res?.ok) {
        return {
          ok: true,
          msg: t('capture.toast.writeback.done', { n: res.data.updated, name: res.data.name }),
        };
      }
      return { ok: false, msg: t('capture.toast.storageFull') };
    }

    async function handleSaveMemory(): Promise<{ ok: boolean; msg: string }> {
      const { fields } = serializeFields(document, { skipSensitive });
      try {
        const res = await chrome.runtime.sendMessage({
          type: 'SAVE_PAGE_MEMORY',
          url: normalizeUrlForMemory(window.location.href),
          fields,
        });
        if (!res?.ok) return { ok: false, msg: t('capture.toast.storageFull') };
        return { ok: true, msg: t('capture.toast.memory.saved', { n: fields.length }) };
      } catch {
        return { ok: false, msg: t('capture.toast.storageFull') };
      }
    }

    function savePosition(pos: { x: number; y: number }) {
      chrome.runtime
        .sendMessage({ type: 'SAVE_TOOLBAR_POSITION', position: pos })
        .catch(() => { /* ignore */ });
    }

    // ── Opt-in gate ─────────────────────────────────────────────────────────
    // The content script now runs on every http(s) page (so TRIGGER_FILL from
    // the popup can always reach us), but it stays invisible unless one of:
    //   1. The page's hostname is in the user's allowedDomains list.
    //   2. There's a saved draft for this URL.
    //   3. There's saved page memory for this URL.
    //   4. The user explicitly invokes fill from the popup (TRIGGER_FILL).
    const hostname = safeHostname(window.location.href);
    const allowedDomains = settings?.allowedDomains ?? DEFAULT_ALLOWED_DOMAINS;
    const domainAllowed = matchesAllowedDomain(hostname, allowedDomains);

    let hasDraft = false;
    let hasMemory = false;
    try {
      const [draftRes, memRes] = await Promise.all([
        chrome.runtime.sendMessage({
          type: 'GET_DRAFT',
          url: normalizeUrlForDraft(window.location.href),
        }),
        chrome.runtime.sendMessage({
          type: 'GET_PAGE_MEMORY',
          url: normalizeUrlForMemory(window.location.href),
        }),
      ]);
      hasDraft = !!(draftRes?.ok && draftRes.data);
      hasMemory = !!(memRes?.ok && (memRes.data as PageMemoryEntry[])?.length);
    } catch { /* ignore — treat as no stored data */ }

    const shouldAutoShow = domainAllowed || hasDraft || hasMemory;

    // ── Mount state (lazy) ──────────────────────────────────────────────────
    let mounted = false;
    let toolbar: { unmount: () => void } | null = null;
    let badge: { unmount: () => void } | null = null;
    let badgeUrl: string | null = null;
    let cleanupObservers: (() => void) | null = null;
    let mountedPickers: MountedCandidatePicker[] = [];
    let promptedDomainPrefs: Set<string> = new Set();

    const storageListener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'local') return;
      if ('formpilot:activeResumeId' in changes || 'formpilot:resumes' in changes) {
        fetchActiveResume().catch(() => { /* ignore */ });
      }
      // Settings changed in another tab: if the user just added the current
      // hostname to allowedDomains, mount the toolbar live without a reload.
      if ('formpilot:settings' in changes && !mounted) {
        const next = changes['formpilot:settings'].newValue as Partial<Settings> | undefined;
        const nextDomains = next?.allowedDomains ?? DEFAULT_ALLOWED_DOMAINS;
        if (matchesAllowedDomain(hostname, nextDomains)) {
          ensureMounted().catch(() => { /* ignore */ });
        }
      }
    };

    // Monotonically increasing token: if a newer refreshDraftBadge started
    // while this one was mid-await, abandon our work. Prevents two rapid
    // save-drafts from leaking the first in-flight mount.
    let badgeRefreshToken = 0;

    async function refreshDraftBadge(): Promise<void> {
      const myToken = ++badgeRefreshToken;
      const url = normalizeUrlForDraft(window.location.href);
      if (url === badgeUrl && badge) return;
      badge?.unmount();
      badge = null;
      badgeUrl = url;
      try {
        const res = await chrome.runtime.sendMessage({ type: 'GET_DRAFT', url });
        if (myToken !== badgeRefreshToken) return;
        const snapshot = res?.ok ? (res.data as DraftSnapshot | null) : null;
        if (!snapshot) return;
        const newBadge = await mountDraftBadge({
          ctx,
          snapshot,
          onRestore: async () => {
            const { restored, missing, elements } = restoreFields(document, snapshot.fields);
            paintDraftHighlights(elements);
            return { filled: restored, total: restored + missing };
          },
          onRestoreAndFill: async () => {
            const { restored, missing, elements } = restoreFields(document, snapshot.fields);
            paintDraftHighlights(elements);
            await handleFill();
            return { filled: restored, total: restored + missing };
          },
          onIgnore: () => { badge?.unmount(); badge = null; },
          onDelete: async () => {
            await chrome.runtime.sendMessage({ type: 'DELETE_DRAFT', url });
            badge?.unmount();
            badge = null;
          },
        });
        if (myToken !== badgeRefreshToken) {
          newBadge.unmount();
          return;
        }
        // If a previous in-flight mount somehow still set `badge`, unmount it
        // before replacing — defense beyond the token check.
        badge?.unmount();
        badge = newBadge;
      } catch { /* ignore */ }
    }

    async function ensureMounted(): Promise<void> {
      if (mounted) return;
      mounted = true;
      await fetchActiveResume(); // prime hasActive for the save menu
      toolbar = await mountToolbar({
        ctx,
        initialPosition,
        onPositionSave: savePosition,
        onFill: handleFill,
        onSaveDraft: handleSaveDraft,
        onWriteBack: handleWriteBack,
        onSaveMemory: handleSaveMemory,
        getHasActiveResume: () => hasActive,
      });
      await refreshDraftBadge();
      cleanupObservers = observeFormChanges(ctx, handleFill, () => {
        refreshDraftBadge().catch(() => { /* ignore */ });
      });
    }

    // Always subscribe to storage changes — even when we haven't mounted —
    // so adding the current hostname to allowedDomains from Settings mounts
    // the toolbar live, and resume create/delete keeps hasActive fresh.
    chrome.storage.onChanged.addListener(storageListener);

    if (shouldAutoShow) await ensureMounted();

    // ── TRIGGER_FILL listener — always on (even before mount) ──────────────
    const messageListener = (
      message: { type?: string },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: unknown) => void,
    ): true | void => {
      if (message?.type === 'TRIGGER_FILL') {
        (async () => {
          // Lazy-mount so the user can use the save menu after a popup fill.
          await ensureMounted();
          const result = await handleFill();
          sendResponse({ ok: true, data: result });
        })().catch(() => sendResponse({ ok: false }));
        return true;
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    ctx.onInvalidated(() => {
      cleanupObservers?.();
      toolbar?.unmount();
      badge?.unmount();
      for (const p of mountedPickers) { try { p.unmount(); } catch { /* ignore */ } }
      mountedPickers = [];
      chrome.storage.onChanged.removeListener(storageListener);
      chrome.runtime.onMessage.removeListener(messageListener);
    });
  },
});

// ─── Field Highlights ────────────────────────────────────────────────────────

/**
 * Set box-shadow with !important so host-page styles (many job sites use
 * `input { box-shadow: ... !important }` for focus/error states) don't
 * override our status highlights.
 */
function setImportantShadow(el: HTMLElement, shadow: string): void {
  if (shadow) {
    el.style.setProperty('box-shadow', shadow, 'important');
  } else {
    el.style.removeProperty('box-shadow');
  }
}

function applyFieldHighlights(result: FillResult): void {
  const colors: Record<string, string> = {
    filled: '0 0 0 2px #4ade80',       // green
    uncertain: '0 0 0 2px #f59e0b',    // amber
    unrecognized: '0 0 0 2px #ef4444', // red
  };
  for (const item of result.items) {
    if (!item.element || !(item.element instanceof HTMLElement)) continue;
    const el = item.element;
    el.removeAttribute('data-formpilot-status');
    if (item.source === 'memory' && item.status === 'filled') {
      setImportantShadow(el, '0 0 0 2px #a855f7'); // purple — per-URL memory
      el.setAttribute('data-formpilot-status', 'memory');
    } else if (item.source === 'form' && item.status === 'filled') {
      setImportantShadow(el, '0 0 0 2px #ec4899'); // pink — cross-URL form entry
      el.setAttribute('data-formpilot-status', 'form');
    } else {
      setImportantShadow(el, colors[item.status] ?? '');
      el.setAttribute('data-formpilot-status', item.status);
    }
  }
}

function paintDraftHighlights(elements: HTMLElement[]): void {
  for (const el of elements) {
    setImportantShadow(el, '0 0 0 2px #22d3ee'); // cyan for draft
    el.setAttribute('data-formpilot-status', 'draft');
  }
}

// ─── Form Change Observer ────────────────────────────────────────────────────

function observeFormChanges(
  ctx: InstanceType<typeof ContentScriptContext>,
  onFill: () => void,
  onUrlChange?: (newUrl: string) => void,
): () => void {
  let lastUrl = window.location.href;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const formSelector =
    'input, select, textarea, [contenteditable]:not([contenteditable="false"])';
  const mutationObserver = new MutationObserver((mutations) => {
    const hasNewFormElements = mutations.some((m) =>
      Array.from(m.addedNodes).some(
        (node) =>
          node instanceof HTMLElement &&
          (node.querySelector(formSelector) || node.matches?.(formSelector)),
      ),
    );
    if (hasNewFormElements) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onFill();
      }, 800);
    }
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  const intervalId = ctx.setInterval(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      const highlighted = document.querySelectorAll<HTMLElement>(
        '[data-formpilot-status]',
      );
      for (const el of highlighted) {
        el.style.removeProperty('box-shadow');
        el.removeAttribute('data-formpilot-status');
      }
      onUrlChange?.(currentUrl);
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onFill();
      }, 800);
    }
  }, 1000);

  return () => {
    mutationObserver.disconnect();
    clearTimeout(debounceTimer);
    clearInterval(intervalId);
  };
}
