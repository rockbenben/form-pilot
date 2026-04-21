import React, { useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import FloatingToolbar from './FloatingToolbar';
import ResultBubble from './ResultBubble';
import SaveMenu from '@/components/capture/SaveMenu';
import ToolbarToast from '@/components/capture/ToolbarToast';
import type { FillResult } from '@/lib/engine/adapters/types';
import { makeT } from '@/lib/i18n';

interface ToolbarAppProps {
  /** Initial position: left offset from viewport left, bottom offset from viewport bottom */
  initialPosition: { x: number; y: number };
  onPositionSave: (pos: { x: number; y: number }) => void;
  onFill: () => Promise<FillResult>;
  onSaveDraft: () => Promise<{ ok: boolean; msg: string }>;
  onWriteBack: () => Promise<{ ok: boolean; msg: string }>;
  onSaveMemory: () => Promise<{ ok: boolean; msg: string }>;
  getHasActiveResume: () => boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

function ToolbarApp({
  initialPosition,
  onPositionSave,
  onFill,
  onSaveDraft,
  onWriteBack,
  onSaveMemory,
  getHasActiveResume,
  t,
}: ToolbarAppProps) {
  const [pos, setPos] = useState(initialPosition);
  const [filling, setFilling] = useState(false);
  const [fillResult, setFillResult] = useState<FillResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const handlePositionChange = useCallback(
    (delta: { x: number; y: number }) => {
      setPos((prev) => {
        const next = {
          x: Math.max(0, prev.x + delta.x),
          y: Math.max(0, prev.y + delta.y),
        };
        onPositionSave(next);
        return next;
      });
    },
    [onPositionSave],
  );

  const handleFill = useCallback(async () => {
    if (filling) return;
    setFilling(true);
    try {
      const result = await onFill();
      setFillResult(result);
      setShowResult(true);
    } finally {
      setFilling(false);
    }
  }, [filling, onFill]);

  async function runSave(cb: () => Promise<{ ok: boolean; msg: string }>) {
    setMenuOpen(false);
    const { msg } = await cb();
    setToast(msg);
  }

  const total = fillResult
    ? fillResult.filled + fillResult.uncertain + fillResult.unrecognized
    : 0;

  const wrapperStyle: React.CSSProperties = {
    position: 'fixed',
    left: pos.x,
    bottom: pos.y,
    zIndex: 999999,
    // Host shadow-root container has pointer-events: none; opt back in here
    // so the toolbar (and its bubble/menu children, which default to auto)
    // still receives clicks.
    pointerEvents: 'auto',
  };

  return (
    <div style={wrapperStyle}>
      {showResult && fillResult && (
        <ResultBubble result={fillResult} onClose={() => setShowResult(false)} t={t} />
      )}
      {toast && <ToolbarToast message={toast} onDismiss={() => setToast(null)} />}
      <div style={{ position: 'relative' }}>
        <FloatingToolbar
          onPositionChange={handlePositionChange}
          onFill={handleFill}
          filling={filling}
          fillResult={fillResult ? { filled: fillResult.filled, total } : null}
          onToggleResult={() => setShowResult((v) => !v)}
          onToggleSaveMenu={() => setMenuOpen((v) => !v)}
          saveMenuOpen={menuOpen}
          t={t}
        />
        {menuOpen && (
          <SaveMenu
            t={t}
            hasActiveResume={getHasActiveResume()}
            onSaveDraft={() => runSave(onSaveDraft)}
            onWriteBack={() => runSave(onWriteBack)}
            onSaveMemory={() => runSave(onSaveMemory)}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

export interface ToolbarMountOptions {
  ctx: InstanceType<typeof ContentScriptContext>;
  initialPosition: { x: number; y: number };
  onPositionSave: (pos: { x: number; y: number }) => void;
  onFill: () => Promise<FillResult>;
  onSaveDraft: () => Promise<{ ok: boolean; msg: string }>;
  onWriteBack: () => Promise<{ ok: boolean; msg: string }>;
  onSaveMemory: () => Promise<{ ok: boolean; msg: string }>;
  getHasActiveResume: () => boolean;
}

/**
 * Mount the floating toolbar into a Shadow DOM via WXT's createShadowRootUi.
 * Style isolation ensures the toolbar looks correct on any host page.
 */
export async function mountToolbar(options: ToolbarMountOptions): Promise<{ unmount: () => void }> {
  // Load locale from storage before mounting so the toolbar is i18n-aware
  const stored = await chrome.storage.local.get('formpilot:locale');
  const locale = (stored['formpilot:locale'] === 'en') ? 'en' : 'zh';
  const t = makeT(locale);

  const ui = await createShadowRootUi(options.ctx, {
    name: 'formpilot-toolbar',
    // 'inline' places the shadow host in normal document flow with 0 visible
    // footprint (our inner wrapper is position: fixed). `modal` would span
    // the full viewport and intercept clicks outside the toolbar, which
    // broke radios/selects on the host page.
    position: 'inline',
    anchor: 'body',
    append: 'last',
    onMount(container) {
      const root = ReactDOM.createRoot(container);
      root.render(
        <ToolbarApp
          initialPosition={options.initialPosition}
          onPositionSave={options.onPositionSave}
          onFill={options.onFill}
          onSaveDraft={options.onSaveDraft}
          onWriteBack={options.onWriteBack}
          onSaveMemory={options.onSaveMemory}
          getHasActiveResume={options.getHasActiveResume}
          t={t}
        />,
      );
      return root;
    },
    onRemove(root) {
      root?.unmount();
    },
  });

  ui.mount();
  return {
    unmount: () => ui.remove(),
  };
}
