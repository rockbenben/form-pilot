import { findAdapter } from '@/lib/engine/adapters/registry';
import { orchestrateFill } from '@/lib/engine/orchestrator';
import type { FillResult, FillResultItem } from '@/lib/engine/adapters/types';
import type { Resume, Settings } from '@/lib/storage/types';
import { createEmptyResume } from '@/lib/storage/types';
import type { DraftSnapshot, PageMemoryEntry } from '@/lib/capture/types';
import type { FormEntry } from '@/lib/storage/form-store';
import { mountToolbar } from '@/components/toolbar/mount';
import { mountDraftBadge } from '@/components/capture/mount-badge';
import { serializeFields } from '@/lib/capture/serializer';
import { restoreFields } from '@/lib/capture/restorer';
import { scanFields } from '@/lib/engine/scanner';
import { collectWriteBack } from '@/lib/capture/writeback';
import { normalizeUrlForDraft, normalizeUrlForMemory } from '@/lib/capture/url-key';
import { resolveSiteOverride, safeHostname } from '@/lib/capture/domain-match';
import { probeResumeFields } from '@/lib/engine/probe';
import { resolveVisibility } from '@/lib/engine/visibility';
import { normalizeDomain, type FieldDomainPrefs } from '@/lib/storage/domain-prefs-store';
import { makeT, resolveLocale } from '@/lib/i18n';
import { computeSignatureFor } from '@/lib/capture/signature';
import { fillElement } from '@/lib/engine/heuristic/fillers';
import { detectElementKind } from '@/lib/capture/element-value';
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
    const FORM_SELECTOR =
      'input, select, textarea, [contenteditable]:not([contenteditable="false"])';
    const countFormElements = () => document.querySelectorAll(FORM_SELECTOR).length;

    // Load settings
    let settings: Settings | null = null;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (res?.ok) settings = res.data as Settings;
    } catch { /* use defaults */ }

    const stored = await chrome.storage.local.get('formpilot:locale');
    const locale = resolveLocale(stored['formpilot:locale']);
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
      profileDomainPrefs: Record<string, Record<string, string>>;
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
            profileDomainPrefs: data.profileDomainPrefs ?? {},
          };
        }
      } catch { /* ignore */ }
      return {
        resume: null,
        memory: [],
        formEntries: {},
        domainPrefs: {},
        currentDomain,
        profileDomainPrefs: {},
      };
    }

    // ── Fill handler ────────────────────────────────────────────────────────
    async function handleFill(): Promise<FillResult> {
      // `empty: 0` was missing. This object is what a fill returns when it
      // cannot run, and it travels to the popup, which reads `.empty` for the
      // 「待补」 count and to decide whether to show the "complete your profile"
      // hint. Undefined there rendered a NaN-wide bar segment and hid the hint.
      const empty: FillResult = { items: [], filled: 0, uncertain: 0, empty: 0, unrecognized: 0 };
      // Unmount any pickers from a previous fill before starting a new one.
      for (const p of mountedPickers) { try { p.unmount(); } catch { /* ignore */ } }
      mountedPickers = [];
      try {
        const { resume, memory, formEntries, domainPrefs, currentDomain, profileDomainPrefs } = await fetchFillContext();
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
          profileDomainPrefs,
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

        const profileHits = result.profileHits ?? [];
        for (const hit of profileHits) {
          chrome.runtime.sendMessage({
            type: 'BUMP_PROFILE_HIT',
            resumePath: hit.resumePath,
            candidateId: hit.candidateId,
            sourceUrl: window.location.href,
          });
        }

        // Helper: mount a ▾ picker for a Phase 2 profile multi-value field.
        // Defined here (inside handleFill's try block) so it closes over
        // `resume`, `currentDomain`, `t`, `promptedDomainPrefs`, and
        // `mountedPickers` from the surrounding scopes.
        function mountProfilePickerInline(
          it: FillResultItem,
          resumePath: 'basic.phone' | 'basic.email',
          currentCandidateId: string | null,
        ) {
          if (!resume) return;
          // Hold mutable state on a single object so pin-toggle and delete
          // callbacks share their view across repeat invocations (scalar-param
          // reassignment won't persist across the picker's callback lifetime).
          const state = {
            candidates: resumePath === 'basic.phone' ? resume.basic.phone : resume.basic.email,
            pinnedId: resumePath === 'basic.phone' ? resume.basic.phonePinnedId : resume.basic.emailPinnedId,
          };

          let picker: MountedCandidatePicker;
          picker = mountCandidatePicker({
            target: it.element as Element,
            signature: `profile:${resumePath}`,
            candidates: state.candidates,
            pinnedId: state.pinnedId,
            currentCandidateId,
            t,
            onSelect: async (cid) => {
              const picked = state.candidates.find((c) => c.id === cid);
              if (!picked) return;
              // Detect current widget kind — phone/email can be text, tel, or
              // even a <select> for country-code splits. Hardcoding 'text' here
              // silently failed on non-text widgets.
              const kind = detectElementKind(it.element as Element) ?? 'text';
              let ok = false;
              try {
                ok = await fillElement(it.element as Element, picked.value, kind);
              } catch { ok = false; }
              // Only bump hitCount AND prompt for domain-pref when the fill
              // actually succeeded.
              if (!ok) return;
              chrome.runtime.sendMessage({
                type: 'BUMP_PROFILE_HIT',
                resumePath,
                candidateId: cid,
                sourceUrl: window.location.href,
              });
              const promptKey = `profile:${resumePath}:${currentDomain}`;
              if (!promptedDomainPrefs.has(promptKey)) {
                promptedDomainPrefs.add(promptKey);
                const msg = t('candidate.domainPref.rememberToast', {
                  domain: currentDomain,
                  value: picked.label ?? picked.value,
                });
                if (window.confirm(msg)) {
                  chrome.runtime.sendMessage({
                    type: 'SET_PROFILE_DOMAIN_PREF',
                    resumePath,
                    domain: currentDomain,
                    candidateId: cid,
                  });
                }
              }
            },
            onPinToggle: async (cid) => {
              const next = state.pinnedId === cid ? null : cid;
              await chrome.runtime.sendMessage({ type: 'SET_PROFILE_PIN', resumePath, candidateId: next });
              state.pinnedId = next;
              picker.update({ pinnedId: next });
            },
            onDelete: async (cid) => {
              await chrome.runtime.sendMessage({ type: 'DELETE_PROFILE_CANDIDATE', resumePath, candidateId: cid });
              const idx = state.candidates.findIndex((c) => c.id === cid);
              if (idx >= 0) state.candidates.splice(idx, 1);
              if (state.pinnedId === cid) state.pinnedId = null;
              picker.update({ candidates: state.candidates, pinnedId: state.pinnedId });
              if (state.candidates.length < 2) {
                const mIdx = mountedPickers.indexOf(picker);
                if (mIdx >= 0) mountedPickers.splice(mIdx, 1);
                picker.unmount();
              }
            },
            onManageAll: () => {
              const url = chrome.runtime.getURL('/dashboard.html') + '#basic';
              window.open(url, '_blank');
            },
          });
          mountedPickers.push(picker);
        }

        // Mount a ▾ picker beside every multi-candidate field.
        for (const it of result.items) {
          if (!it.element) continue;

          // Phase 4: signature-keyed form entries (Phase A, unchanged).
          if (it.source === 'form') {
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
                // Detect the CURRENT element's kind — the stored entry.kind can diverge
                // if the same signature is rendered by a different widget on this site.
                const kind = detectElementKind(it.element as Element) ?? entry.kind;
                let ok = false;
                try {
                  ok = await fillElement(it.element as Element, val, kind);
                } catch { ok = false; }
                // Only bump hitCount AND prompt for domain-pref when the fill
                // actually succeeded — otherwise read-only / wrong-widget fields
                // inflate counts and prompt users to "remember" values they never
                // saw filled.
                if (!ok) return;
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
            continue;
          }

          // Phase 2: profile multi-value (basic.phone / basic.email).
          if (it.resumePath === 'basic.phone' || it.resumePath === 'basic.email') {
            if (!resume) continue;
            const rp = it.resumePath;
            const candidates = rp === 'basic.phone' ? resume.basic.phone : resume.basic.email;
            if (candidates.length < 2) continue;
            const currentCandidateId = profileHits.find((h) => h.resumePath === rp)?.candidateId ?? null;
            mountProfilePickerInline(it, rp, currentCandidateId);
          }
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

    // ── Mount state (lazy) ──────────────────────────────────────────────────
    // Declared ahead of the opt-in gate below because the gate may call
    // refreshDraftBadge() (which reads/writes this state) before it mounts
    // anything.
    let mounted = false;
    let toolbar: { unmount: () => void } | null = null;
    let badge: { unmount: () => void } | null = null;
    let badgeUrl: string | null = null;
    let cleanupObservers: (() => void) | null = null;
    let mountedPickers: MountedCandidatePicker[] = [];
    let promptedDomainPrefs: Set<string> = new Set();

    // Monotonically increasing token: if a newer refreshDraftBadge started
    // while this one was mid-await, abandon our work. Prevents two rapid
    // save-drafts from leaking the first in-flight mount.
    let badgeRefreshToken = 0;

    // Same pattern for ensureMounted(): if a teardown (or a teardown
    // followed by a fresh mount) runs while mountToolbar() is mid-await, the
    // stale call must not resurrect a toolbar the code believes is gone —
    // or, worse, overwrite a newer one. Bumped on every teardown path.
    let toolbarMountToken = 0;

    // ── Shared teardown ─────────────────────────────────────────────────────
    // The toolbar/observer teardown sequence is identical everywhere it
    // happens; only whether the draft badge also comes down differs. Hiding
    // for a page ("Hide on this page", the Alt+Shift+F toggle) is not a
    // statement about the user's saved draft, so those callers pass
    // `includeBadge: false`. Only "Never on this site" and the storage
    // listener's 'never' branch pass `true`.
    function teardownToolbar({ includeBadge }: { includeBadge: boolean }): void {
      // Must run first: the observer installed by ensureMounted() calls real
      // autofill on DOM mutations, so leaving it alive after a teardown is a
      // silent-autofill bug.
      cleanupObservers?.();
      cleanupObservers = null;
      toolbar?.unmount();
      toolbar = null;
      mounted = false;
      // Abandons any in-flight ensureMounted() so it cannot resurrect a
      // toolbar this teardown just tore down.
      ++toolbarMountToken;
      if (includeBadge) {
        badge?.unmount();
        badge = null;
        // Abandons any in-flight refreshDraftBadge() so it cannot remount
        // the badge after this teardown ran.
        ++badgeRefreshToken;
      }
    }

    // ── Opt-in gate ─────────────────────────────────────────────────────────
    // The content script runs on every http(s) page so TRIGGER_FILL and
    // TOGGLE_TOOLBAR can always reach us, but it stays invisible unless the
    // page actually asks for resume information — or the user says otherwise.
    // Precedence lives in resolveVisibility(); see lib/engine/visibility.ts.
    const hostname = safeHostname(window.location.href);
    // Mutable: these model the currently effective settings for this page.
    // The storage listener below keeps them in sync, so a settings change in
    // another tab is reflected the next time runGate() runs or the badge
    // condition is evaluated — not just at this initial page load.
    let triggerMode = settings?.triggerMode ?? 'auto';
    let currentOverride = resolveSiteOverride(hostname, settings?.siteOverrides ?? {});

    /**
     * Evaluate the gate for the page as it stands right now. Fires the two
     * storage lookups first and runs the probe while they are in flight — the
     * probe is synchronous main-thread work, so it costs nothing extra inside
     * a window we were going to spend on IPC anyway.
     */
    async function runGate(): Promise<{ show: boolean; hasDraft: boolean }> {
      const pending = Promise.all([
        chrome.runtime.sendMessage({
          type: 'GET_DRAFT',
          url: normalizeUrlForDraft(window.location.href),
        }),
        chrome.runtime.sendMessage({ type: 'HAS_PROFILE_DATA' }),
        chrome.runtime.sendMessage({
          type: 'GET_PAGE_MEMORY',
          url: normalizeUrlForMemory(window.location.href),
        }),
      ]).catch(() => [null, null, null] as const);

      const resumeFieldCount = probeResumeFields(document);

      const [draftRes, profileRes, memRes] = await pending;
      const hasDraft = !!(draftRes?.ok && draftRes.data);
      const hasMemory = !!(memRes?.ok && (memRes.data as PageMemoryEntry[])?.length);
      // A failed lookup must not silence the toolbar for someone whose profile
      // is fine, so an unusable reply is treated as "has data".
      const profileHasData = profileRes?.ok ? profileRes.data !== false : true;

      return {
        show: resolveVisibility({
          override: currentOverride,
          triggerMode,
          hasDraft,
          hasMemory,
          resumeFieldCount,
          profileHasData,
        }),
        hasDraft,
      };
    }

    // A page can start with no form at all and grow one only once the user
    // clicks an "edit" affordance — the 猎聘 / 智联 / BOSS resume pages all
    // render read-only until you do, so at load time they expose zero inputs.
    // This check used to `return` outright, which also skipped registering the
    // message listeners further down and left the extension unreachable by
    // keyboard command or popup on exactly those pages. It now gates only the
    // auto-show work; everything summonable stays wired up regardless.
    const pageHasForm = countFormElements() > 3;

    const gate = pageHasForm ? await runGate() : { show: false, hasDraft: false };
    const shouldAutoShow = gate.show;

    // The draft badge is not governed by resolveVisibility. A draft is the
    // user's own half-finished application coming back to find them, and it
    // expires after 30 days — suppressing it risks silent data loss. Only a
    // 'never' site override silences it.
    if (gate.hasDraft && currentOverride !== 'never') {
      await refreshDraftBadge();
    }

    const storageListener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'local') return;
      if ('formpilot:activeResumeId' in changes || 'formpilot:resumes' in changes) {
        fetchActiveResume().catch(() => { /* ignore */ });
      }
      if ('formpilot:settings' in changes) {
        const next = changes['formpilot:settings'].newValue as Partial<Settings> | undefined;
        // Sync the effective-settings bindings before anything below (this
        // branch's own checks, or a later runGate()) reads them — otherwise
        // runGate() would keep evaluating resolveVisibility() against the
        // page-load snapshot forever, and the auto-mode re-probe below would
        // be permanently dead once triggerMode started out as 'manual'.
        currentOverride = resolveSiteOverride(hostname, next?.siteOverrides ?? {});
        triggerMode = next?.triggerMode ?? 'auto';

        // 'never' wins regardless of mount state. The badge has a lifecycle
        // independent of `mounted` (it can be showing standalone in manual
        // mode with no toolbar), so it must be torn down here too — not just
        // when a toolbar happens to be live.
        if (currentOverride === 'never') {
          teardownToolbar({ includeBadge: true });
          return;
        }

        // Only 'never' tears down a live toolbar. Switching auto → manual
        // takes effect from the next page load: yanking a toolbar out from
        // under someone mid-fill is worse than one page of inconsistency.
        if (mounted) return;

        if (currentOverride === 'always') {
          ensureMounted().catch(() => { /* ignore */ });
          // Unconditional and idempotent (guarded by its own
          // `url === badgeUrl && badge` check) — simpler than a second
          // draft lookup just to decide whether to call it.
          refreshDraftBadge().catch(() => { /* ignore */ });
          return;
        }
        if (triggerMode === 'auto') {
          // Re-probe: the page may well qualify now that manual mode is off.
          // Reuse the hasDraft runGate() already computed instead of a
          // second lookup, so a draft saved in another tab shows up here
          // too instead of waiting for a reload.
          runGate()
            .then(async (g) => {
              if (!g.show) return;
              await ensureMounted();
              if (g.hasDraft) await refreshDraftBadge();
            })
            .catch(() => { /* ignore */ });
        }
      }
    };

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
        // before replacing — defense beyond the token check. Read through an
        // explicitly typed alias: the `badge = null` above narrows it to null
        // for the rest of this body, and control-flow analysis cannot see that
        // another invocation may have assigned it across the await.
        (badge as typeof newBadge | null)?.unmount();
        badge = newBadge;
      } catch { /* ignore */ }
    }

    async function ensureMounted(): Promise<void> {
      if (mounted) return;
      mounted = true;
      const myToken = ++toolbarMountToken;
      await fetchActiveResume(); // prime hasActive for the save menu
      const newToolbar = await mountToolbar({
        ctx,
        initialPosition,
        onPositionSave: savePosition,
        onFill: handleFill,
        onSaveDraft: handleSaveDraft,
        onWriteBack: handleWriteBack,
        onSaveMemory: handleSaveMemory,
        getHasActiveResume: () => hasActive,
        onHidePage: () => {
          teardownToolbar({ includeBadge: false });
        },
        onNeverSite: () => {
          chrome.runtime
            .sendMessage({ type: 'SET_SITE_OVERRIDE', domain: hostname, value: 'never' })
            .catch(() => { /* ignore */ });
          teardownToolbar({ includeBadge: true });
        },
      });
      // A teardown (or a teardown followed by a fresh ensureMounted()) may
      // have run while mountToolbar() was mid-await. `!mounted` catches a
      // plain teardown; the token catches a teardown followed by a newer
      // mount, which would otherwise let this stale call overwrite it.
      if (myToken !== toolbarMountToken || !mounted) {
        newToolbar.unmount();
        return;
      }
      toolbar = newToolbar;
      // Drop the gate-mode observer (if any) before installing the
      // fill-oriented one, so a page never runs both.
      cleanupObservers?.();
      cleanupObservers = observeFormChanges(ctx, handleFill, () => {
        refreshDraftBadge().catch(() => { /* ignore */ });
      });
    }

    // Always subscribe to storage changes — even when we haven't mounted —
    // so flipping a site override to 'always' (or turning off manual mode)
    // mounts the toolbar live, and resume create/delete keeps hasActive fresh.
    chrome.storage.onChanged.addListener(storageListener);

    /**
     * Watch for a form that only appears after the user acts.
     *
     * Read-only resume pages render their fields when an "edit" control is
     * clicked, so at load there is nothing to gate on. A MutationObserver would
     * catch it, but running one on every formless page in the browser is a poor
     * trade — a click listener costs nothing until the user actually clicks,
     * and "user clicked something" is precisely the signal that precedes the
     * form appearing.
     *
     * Bounded: stops after the first successful mount, and after 15 fruitless
     * re-checks so a click-heavy page cannot keep re-probing forever.
     */
    function watchForLateForm(): () => void {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let attempts = 0;
      const onClick = () => {
        if (mounted || attempts >= 15) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (mounted || countFormElements() <= 3) return;
          attempts += 1;
          runGate()
            .then((g) => {
              if (g.hasDraft && currentOverride !== 'never') refreshDraftBadge().catch(() => {});
              if (g.show) return ensureMounted();
            })
            .catch(() => { /* ignore */ });
        }, 600);
      };
      document.addEventListener('click', onClick, { capture: true, passive: true });
      return () => {
        document.removeEventListener('click', onClick, { capture: true });
        clearTimeout(timer);
      };
    }

    let cleanupLateFormWatcher: (() => void) | null = null;

    if (shouldAutoShow) {
      await ensureMounted();
    } else if (triggerMode === 'auto' && currentOverride !== 'never') {
      if (pageHasForm) {
        // Not showing yet, but this may be an SPA that navigates into a real
        // application form without a reload. Watch for that and re-run the gate.
        // Once mounted, ensureMounted() swaps in the fill-oriented observer.
        cleanupObservers = observeFormChanges(
          ctx,
          () => {
            runGate()
              .then((g) => { if (g.show) return ensureMounted(); })
              .catch(() => { /* ignore */ });
          },
          () => {
            runGate()
              .then((g) => {
                if (g.hasDraft && currentOverride !== 'never') refreshDraftBadge().catch(() => {});
                if (g.show) return ensureMounted();
              })
              .catch(() => { /* ignore */ });
          },
          { maxFormChangeFires: 20 },
        );
      } else {
        cleanupLateFormWatcher = watchForLateForm();
      }
    }

    // ── TRIGGER_FILL listener — always on (even before mount) ──────────────
    const messageListener = (
      message: { type?: string; save?: 'draft' | 'writeback' | 'memory' },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: unknown) => void,
    ): true | void => {
      if (message?.type === 'TRIGGER_FILL') {
        (async () => {
          // Lazy-mount so the user can use the save menu after a popup fill.
          await ensureMounted();
          const result = await handleFill();
          // `items` carries live Element references, which do not survive
          // serialization — send only the counts the popup actually renders.
          sendResponse({
            ok: true,
            data: {
              filled: result.filled,
              uncertain: result.uncertain,
              empty: result.empty,
              unrecognized: result.unrecognized,
            },
          });
        })().catch(() => sendResponse({ ok: false }));
        return true;
      }
      if (message?.type === 'TRIGGER_SAVE') {
        // Same three actions as the toolbar's 💾 menu, reachable from the popup
        // so they do not require the toolbar to be on screen.
        (async () => {
          const run =
            message.save === 'draft' ? handleSaveDraft
            : message.save === 'writeback' ? handleWriteBack
            : message.save === 'memory' ? handleSaveMemory
            : null;
          if (!run) { sendResponse({ ok: false }); return; }
          const { ok, msg } = await run();
          sendResponse({ ok, msg });
        })().catch(() => sendResponse({ ok: false }));
        return true;
      }
      if (message?.type === 'TOGGLE_TOOLBAR') {
        // Summoning shows the controls; it does not fill. Filling stays an
        // explicit click, which also makes the command safe to press twice.
        if (mounted) {
          teardownToolbar({ includeBadge: false });
        } else {
          ensureMounted().catch(() => { /* ignore */ });
        }
        sendResponse({ ok: true });
        return true;
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    ctx.onInvalidated(() => {
      cleanupObservers?.();
      cleanupLateFormWatcher?.();
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
  onFormChange: () => void,
  onUrlChange?: (newUrl: string) => void,
  opts?: { maxFormChangeFires?: number },
): () => void {
  let lastUrl = window.location.href;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  // Bounded because an unmounted gate re-probes on every fire. A page that
  // churns its DOM forever must not keep us probing forever. Reset on URL
  // change, which is the reliable SPA signal.
  const maxFires = opts?.maxFormChangeFires ?? Infinity;
  let fires = 0;

  const formSelector =
    'input, select, textarea, [contenteditable]:not([contenteditable="false"])';
  const mutationObserver = new MutationObserver((mutations) => {
    if (fires >= maxFires) return;
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
        fires += 1;
        onFormChange();
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
      fires = 0;
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
        onFormChange();
      }, 800);
    }
  }, 1000);

  return () => {
    mutationObserver.disconnect();
    clearTimeout(debounceTimer);
    clearInterval(intervalId);
  };
}
