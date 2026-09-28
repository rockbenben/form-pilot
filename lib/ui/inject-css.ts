/**
 * The stylesheet for every surface injected into a host page (toolbar, menus,
 * bubbles, picker, badge, toast). One file so the Chrome-native language —
 * tokens, radii, focus rings, dark scheme — is defined exactly once.
 *
 * Mounted as a `<style>` inside the shadow root (see the mount files under
 * components/); `prefers-color-scheme` inside a shadow tree follows the
 * browser theme, which is what Chrome's own floating UI does.
 */
export const INJECT_CSS = `
.fp-scope {
  --fp-surface: #ffffff;
  --fp-sunken: #f8f9fa;
  --fp-fill: #f1f3f4;
  --fp-fill-hover: #e8eaed;
  --fp-line: #dadce0;
  --fp-ink: #202124;
  --fp-ink-2: #5f6368;
  --fp-ink-3: #70757a;
  --fp-primary: #1a73e8;
  --fp-primary-hover: #1967d2;
  --fp-on-primary: #ffffff;
  --fp-link: #1967d2;
  --fp-tint: #e8f0fe;
  --fp-success: #188038;
  --fp-warning: #b06000;
  --fp-warn-bg: #fef7e0;
  --fp-danger: #d93025;
  --fp-danger-bg: #fce8e6;
  --fp-shadow: 0 1px 3px rgba(60,64,67,.30), 0 4px 8px 3px rgba(60,64,67,.15);
  --fp-filled: #188038;
  --fp-uncertain: #b06000;
  --fp-empty: #1a73e8;
  --fp-unrecognized: #d93025;
  font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto,
    "Microsoft YaHei UI", "PingFang SC", sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: var(--fp-ink);
}
@media (prefers-color-scheme: dark) {
  .fp-scope {
    --fp-surface: #2d2d2d;
    --fp-sunken: #252525;
    --fp-fill: #35363a;
    --fp-fill-hover: #3c4043;
    --fp-line: #5f6368;
    --fp-ink: #e8eaed;
    --fp-ink-2: #9aa0a6;
    --fp-ink-3: #8e918f;
    --fp-primary: #8ab4f8;
    --fp-primary-hover: #a8c7fa;
    --fp-on-primary: #0b1420;
    --fp-link: #8ab4f8;
    --fp-tint: rgba(138,180,248,.16);
    --fp-success: #81c995;
    --fp-warning: #fdd663;
    --fp-warn-bg: rgba(253,214,99,.14);
    --fp-danger: #f28b82;
    --fp-danger-bg: rgba(242,139,130,.14);
    --fp-shadow: 0 1px 3px rgba(0,0,0,.40), 0 4px 8px 3px rgba(0,0,0,.30);
    --fp-filled: #81c995;
    --fp-uncertain: #fdd663;
    --fp-empty: #8ab4f8;
    --fp-unrecognized: #f28b82;
  }
}
.fp-scope button {
  font: inherit;
  color: inherit;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
}
.fp-scope button:focus-visible,
.fp-scope a:focus-visible,
.fp-scope input:focus-visible {
  outline: 2px solid var(--fp-primary);
  outline-offset: 1px;
}
.fp-scope button:disabled {
  color: var(--fp-ink-3);
  cursor: default;
}

.fp-scope .fp-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--fp-surface);
  border-radius: 8px;
  box-shadow: var(--fp-shadow);
  padding: 5px 6px;
  user-select: none;
  cursor: grab;
}
.fp-scope .fp-toolbar[data-dragging="true"] {cursor: grabbing; }

.fp-scope .fp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 28px;
  border-radius: 999px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}
.fp-scope .fp-btn-primary {background: var(--fp-primary); color: var(--fp-on-primary); }
.fp-scope .fp-btn-primary:hover:not(:disabled) {background: var(--fp-primary-hover); }
.fp-scope .fp-btn-text {color: var(--fp-link); }
.fp-scope .fp-btn-text:hover:not(:disabled) {background: var(--fp-tint); }
.fp-scope .fp-btn-danger {color: var(--fp-danger); }
.fp-scope .fp-btn-danger:hover:not(:disabled) {background: var(--fp-danger-bg); }

.fp-scope .fp-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  border-radius: 999px;
  padding: 0 10px;
  background: var(--fp-fill);
  color: var(--fp-ink);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.fp-scope .fp-chip-clickable:hover {background: var(--fp-fill-hover); }

.fp-scope .fp-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: var(--fp-ink-2);
}
.fp-scope .fp-icon-btn:hover {background: var(--fp-fill); color: var(--fp-ink); }

.fp-scope .fp-menu {
  position: absolute;
  z-index: 2147483600;
  background: var(--fp-surface);
  border-radius: 8px;
  box-shadow: var(--fp-shadow);
  padding: 4px 0;
  min-width: 180px;
}
.fp-scope .fp-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 28px;
  padding: 5px 14px;
  text-align: start;
  font-size: 13px;
  color: var(--fp-ink);
  white-space: nowrap;
}
.fp-scope .fp-menu-item:hover:not(:disabled) {background: var(--fp-fill-hover); }
.fp-scope .fp-menu-sep {border-top: 1px solid var(--fp-line); margin: 4px 0; }

.fp-scope .fp-bubble {
  position: absolute;
  z-index: 2147483600;
  background: var(--fp-surface);
  border-radius: 8px;
  box-shadow: var(--fp-shadow);
  padding: 12px 14px;
  color: var(--fp-ink);
}
.fp-scope .fp-bubble-title {font-size: 13px; font-weight: 600; }
.fp-scope .fp-eyebrow {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--fp-ink-2);
}
.fp-scope .fp-stat {display: inline-flex; align-items: center; gap: 4px; font-weight: 600; font-variant-numeric: tabular-nums; }
.fp-scope .fp-muted {color: var(--fp-ink-2); }
.fp-scope .fp-faint {color: var(--fp-ink-3); }

.fp-scope .fp-toast {
  position: absolute;
  z-index: 2147483600;
  background: var(--fp-surface);
  border-radius: 8px;
  box-shadow: var(--fp-shadow);
  padding: 8px 12px;
  font-size: 12px;
  color: var(--fp-ink);
  max-width: 280px;
}
.fp-scope .fp-toast-row {display: flex; align-items: center; gap: 8px; }

.fp-scope .fp-picker-panel {
  position: absolute;
  z-index: 2147483600;
  width: 280px;
  background: var(--fp-surface);
  border-radius: 8px;
  box-shadow: var(--fp-shadow);
  padding: 6px 0;
  text-align: start;
}
.fp-scope .fp-picker-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  min-height: 30px;
}
.fp-scope .fp-picker-row:hover {background: var(--fp-fill-hover); }
.fp-scope .fp-picker-main {flex: 1; min-width: 0; display: block; text-align: start; }
.fp-scope .fp-picker-value {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fp-ink);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.fp-scope .fp-picker-sub {font-size: 12px; color: var(--fp-ink-2); padding-inline-start: 20px; }
.fp-scope .fp-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid var(--fp-ink-3);
  flex: none;
}
.fp-scope .fp-dot-on {border: none; background: var(--fp-primary); }
.fp-scope .fp-picker-actions {display: flex; gap: 2px; }
.fp-scope .fp-mini-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: var(--fp-ink-2);
}
.fp-scope .fp-mini-btn:hover {background: var(--fp-fill); color: var(--fp-ink); }
.fp-scope .fp-mini-warn:hover {background: var(--fp-danger-bg); color: var(--fp-danger); }
.fp-scope .fp-mini-star {color: var(--fp-warning); }
.fp-scope .fp-link-btn {color: var(--fp-link); font-size: 12px; font-weight: 500; }
.fp-scope .fp-link-btn:hover {text-decoration: underline; }
`;

/** Append the shared stylesheet to a shadow root (idempotent per root). */
export function ensureInjectStyles(root: ShadowRoot | HTMLElement) {
  if (root.querySelector('style[data-formpilot-ui]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-formpilot-ui', '');
  style.textContent = INJECT_CSS;
  root.appendChild(style);
}
