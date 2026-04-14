import React, { useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import FloatingToolbar from './FloatingToolbar';
import ResultBubble from './ResultBubble';
import type { FillResult } from '@/lib/engine/adapters/types';
import { makeT } from '@/lib/i18n';

interface ToolbarAppProps {
  /** Initial position: left offset from viewport left, bottom offset from viewport bottom */
  initialPosition: { x: number; y: number };
  onPositionSave: (pos: { x: number; y: number }) => void;
  onFill: () => Promise<FillResult>;
  t: (key: string) => string;
}

function ToolbarApp({ initialPosition, onPositionSave, onFill, t }: ToolbarAppProps) {
  // pos.x = distance from left edge, pos.y = distance from bottom edge
  const [pos, setPos] = useState(initialPosition);
  const [filling, setFilling] = useState(false);
  const [fillResult, setFillResult] = useState<FillResult | null>(null);
  const [showResult, setShowResult] = useState(false);

  // Receives delta values from drag
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

  const total = fillResult
    ? fillResult.filled + fillResult.uncertain + fillResult.unrecognized
    : 0;

  const wrapperStyle: React.CSSProperties = {
    position: 'fixed',
    left: pos.x,
    bottom: pos.y,
    zIndex: 999999,
  };

  return (
    <div style={wrapperStyle}>
      {showResult && fillResult && (
        <ResultBubble result={fillResult} onClose={() => setShowResult(false)} t={t} />
      )}
      <FloatingToolbar
        onPositionChange={handlePositionChange}
        onFill={handleFill}
        filling={filling}
        fillResult={fillResult ? { filled: fillResult.filled, total } : null}
        onToggleResult={() => setShowResult((v) => !v)}
        t={t}
      />
    </div>
  );
}

export interface ToolbarMountOptions {
  ctx: InstanceType<typeof ContentScriptContext>;
  initialPosition: { x: number; y: number };
  onPositionSave: (pos: { x: number; y: number }) => void;
  onFill: () => Promise<FillResult>;
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
    position: 'modal',
    zIndex: 999999,
    onMount(container) {
      const root = ReactDOM.createRoot(container);
      root.render(
        <ToolbarApp
          initialPosition={options.initialPosition}
          onPositionSave={options.onPositionSave}
          onFill={options.onFill}
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
