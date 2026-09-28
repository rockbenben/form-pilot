import React, { useState, useRef, useCallback, useEffect } from 'react';
import { BoltIcon, SaveIcon, CloseIcon, CheckIcon, WarnIcon } from '@/lib/ui/icons';

interface FloatingToolbarProps {
  /** Called when user drags toolbar to a new position (delta from initial). */
  onPositionChange: (pos: { x: number; y: number }) => void;
  onFill: () => void;
  filling: boolean;
  fillResult: { filled: number; total: number } | null;
  onToggleResult: () => void;
  onToggleSaveMenu: () => void;
  saveMenuOpen: boolean;
  onToggleCloseMenu: () => void;
  closeMenuOpen: boolean;
  t: (key: string) => string;
}

export default function FloatingToolbar({
  onPositionChange,
  onFill,
  filling,
  fillResult,
  onToggleResult,
  onToggleSaveMenu,
  saveMenuOpen,
  onToggleCloseMenu,
  closeMenuOpen,
  t,
}: FloatingToolbarProps) {
  const [dragging, setDragging] = useState(false);
  // Track the last known screen position for delta calculations during drag
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only drag on the container itself, not buttons
    if ((e.target as HTMLElement).closest('button')) return;
    setDragging(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!lastPos.current) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = lastPos.current.y - e.clientY; // inverted because bottom-anchored
      lastPos.current = { x: e.clientX, y: e.clientY };
      onPositionChange({ x: dx, y: dy });
    };

    const handleMouseUp = () => {
      setDragging(false);
      lastPos.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, onPositionChange]);

  const allFilled =
    fillResult !== null && fillResult.total > 0 && fillResult.filled === fillResult.total;
  const ProgressIcon = allFilled ? CheckIcon : WarnIcon;

  return (
    <div
      ref={containerRef}
      className="fp-toolbar"
      data-dragging={dragging}
      onMouseDown={handleMouseDown}
    >
      <button
        className="fp-btn fp-btn-primary"
        onClick={(e) => {
          e.stopPropagation();
          if (!filling) onFill();
        }}
        disabled={filling}
        title={t('toolbar.fill')}
      >
        <BoltIcon size={15} />
        <span>{filling ? '…' : t('toolbar.fill')}</span>
      </button>
      <button
        className="fp-chip fp-chip-clickable"
        onClick={(e) => {
          e.stopPropagation();
          if (fillResult) onToggleResult();
        }}
        disabled={!fillResult}
        title={fillResult ? t('toolbar.result') : t('toolbar.progress')}
        style={fillResult ? { color: allFilled ? 'var(--fp-filled)' : 'var(--fp-ink)' } : undefined}
      >
        {fillResult ? (
          <>
            <ProgressIcon size={14} />
            {fillResult.filled}/{fillResult.total}
          </>
        ) : (
          '—'
        )}
      </button>
      <button
        className="fp-icon-btn"
        style={saveMenuOpen ? { background: 'var(--fp-fill)', color: 'var(--fp-ink)' } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSaveMenu();
        }}
        title={t('toolbar.save')}
      >
        <SaveIcon size={16} />
      </button>
      <button
        className="fp-icon-btn"
        style={closeMenuOpen ? { background: 'var(--fp-fill)', color: 'var(--fp-ink)' } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggleCloseMenu();
        }}
        title={t('toolbar.close')}
      >
        <CloseIcon size={16} />
      </button>
    </div>
  );
}
