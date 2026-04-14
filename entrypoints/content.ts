import { findAdapter } from '@/lib/engine/adapters/registry';
import { orchestrateFill } from '@/lib/engine/orchestrator';
import type { FillResult } from '@/lib/engine/adapters/types';
import type { Resume, Settings } from '@/lib/storage/types';
import { mountToolbar } from '@/components/toolbar/mount';

export default defineContentScript({
  matches: [
    // Major Chinese recruitment platforms
    '*://*.mokahr.com/*',
    '*://*.moka.com/*',
    '*://*.zhaopin.com/*',
    '*://*.liepin.com/*',
    '*://*.zhipin.com/*',  // BOSS直聘
    '*://*.lagou.com/*',
    '*://*.nowcoder.com/*',
    // Major international ATS
    '*://*.myworkday.com/*',
    '*://*.myworkdayjobs.com/*',
    '*://*.greenhouse.io/*',
    '*://*.lever.co/*',
    '*://*.icims.com/*',
    '*://*.taleo.net/*',
    '*://*.smartrecruiters.com/*',
    // Chinese tech company career sites
    '*://*.hotjob.cn/*',
    '*://*.beisen.com/*',
    '*://*.feishu.cn/*',
    // Career page patterns (path must start with these segments)
    '*://*.com/careers/*',
    '*://*.com/jobs/*',
    '*://*.com/apply/*',
    '*://*.cn/careers/*',
    '*://*.cn/jobs/*',
  ],
  cssInjectionMode: 'ui',

  async main(ctx) {
    // Wait a moment for dynamic content to load
    await new Promise(r => setTimeout(r, 1000));

    // Only mount if the page has form inputs
    const hasFormElements = document.querySelectorAll('input, select, textarea').length > 3;
    if (!hasFormElements) return;

    // ── Load initial settings (toolbar position) ────────────────────────────
    let settings: Settings | null = null;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (res?.ok) settings = res.data as Settings;
    } catch {
      // Background may not be ready yet; use defaults
    }

    const DEFAULT_POSITION = { x: 16, y: 80 };
    const initialPosition = settings?.toolbarPosition ?? DEFAULT_POSITION;

    // ── Handle fill action ──────────────────────────────────────────────────
    async function handleFill(): Promise<FillResult> {
      // Fetch active resume
      let resume: Resume | null = null;
      try {
        const res = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_RESUME' });
        if (res?.ok) resume = res.data as Resume;
      } catch {
        // Ignore send errors
      }

      if (!resume) {
        return { items: [], filled: 0, uncertain: 0, unrecognized: 0 };
      }

      const adapter = findAdapter(window.location.href);
      const result = await orchestrateFill(document, resume, adapter);
      applyFieldHighlights(result);
      return result;
    }

    // ── Save toolbar position ───────────────────────────────────────────────
    function savePosition(pos: { x: number; y: number }) {
      chrome.runtime
        .sendMessage({ type: 'SAVE_TOOLBAR_POSITION', position: pos })
        .catch(() => {/* ignore */});
    }

    // ── Mount the toolbar ───────────────────────────────────────────────────
    const toolbar = await mountToolbar({
      ctx,
      initialPosition,
      onPositionSave: savePosition,
      onFill: handleFill,
    });

    // ── Listen for TRIGGER_FILL from popup ──────────────────────────────────
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'TRIGGER_FILL') {
        handleFill().then((result) => {
          sendResponse({ ok: true, data: result });
        });
        return true; // async response
      }
    });

    // ── Observe form changes (SPA navigation + dynamic form injection) ──────
    const cleanup = observeFormChanges(ctx, handleFill);

    // ── Cleanup on context invalidation ────────────────────────────────────
    ctx.onInvalidated(() => {
      cleanup();
      toolbar.unmount();
    });
  },
});

// ─── Field Highlights ────────────────────────────────────────────────────────

/**
 * Apply colored box-shadow highlights to filled/uncertain/unrecognized fields.
 * Uses element references carried through the fill pipeline for exact matching.
 */
function applyFieldHighlights(result: FillResult): void {
  const colors: Record<string, string> = {
    filled: '0 0 0 2px #4ade80',
    uncertain: '0 0 0 2px #f59e0b',
    unrecognized: '0 0 0 2px #ef4444',
  };
  for (const item of result.items) {
    if (!item.element || !(item.element instanceof HTMLElement)) continue;
    const el = item.element as HTMLElement;
    el.removeAttribute('data-formpilot-status');
    el.style.boxShadow = colors[item.status] ?? '';
    el.setAttribute('data-formpilot-status', item.status);
  }
}

// ─── Form Change Observer ────────────────────────────────────────────────────

/**
 * Watch for:
 * 1. New form elements injected by SPAs (MutationObserver) — auto-refills on detection
 * 2. URL changes in SPAs (setInterval polling)
 *
 * Returns a cleanup function.
 */
function observeFormChanges(
  ctx: InstanceType<typeof ContentScriptContext>,
  onFill: () => void,
): () => void {
  let lastUrl = window.location.href;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  // MutationObserver for new form elements — auto-refill with debounce
  const mutationObserver = new MutationObserver((mutations) => {
    const hasNewFormElements = mutations.some((m) =>
      Array.from(m.addedNodes).some(
        (node) =>
          node instanceof HTMLElement &&
          (node.querySelector('input, select, textarea') ||
            node.matches?.('input, select, textarea')),
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

  // Poll for URL changes (SPA navigation)
  const intervalId = ctx.setInterval(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      // Clear existing field highlights on navigation
      const highlighted = document.querySelectorAll<HTMLElement>(
        '[data-formpilot-status]',
      );
      for (const el of highlighted) {
        el.style.boxShadow = '';
        el.removeAttribute('data-formpilot-status');
      }
      // Auto-refill on URL change (new page/step in SPA)
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
