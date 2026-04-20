import React, { useState, useRef, useCallback, useEffect } from 'react';

interface FloatingToolbarProps {
  /** Called when user drags toolbar to a new position (delta from initial). */
  onPositionChange: (pos: { x: number; y: number }) => void;
  onFill: () => void;
  filling: boolean;
  fillResult: { filled: number; total: number } | null;
  onToggleResult: () => void;
  onToggleSaveMenu: () => void;
  saveMenuOpen: boolean;
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
  t,
}: FloatingToolbarProps) {
  const [dragging, setDragging] = useState(false);
  // Track the last known screen position for delta calculations during drag
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only drag on the container itself, not buttons
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
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

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#1e1e3a',
    borderRadius: '8px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    padding: '8px 10px',
    cursor: dragging ? 'grabbing' : 'grab',
    userSelect: 'none',
  };

  const fillBtnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: filling ? 'not-allowed' : 'pointer',
    opacity: filling ? 0.7 : 1,
    outline: 'none',
    whiteSpace: 'nowrap',
  };

  const progressBtnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: fillResult
      ? fillResult.filled === fillResult.total && fillResult.total > 0
        ? '#22c55e'
        : '#6b7280'
      : '#374151',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '12px',
    fontWeight: 500,
    cursor: fillResult ? 'pointer' : 'default',
    outline: 'none',
    whiteSpace: 'nowrap',
  };

  return (
    <div ref={containerRef} style={containerStyle} onMouseDown={handleMouseDown}>
      <button
        style={fillBtnStyle}
        onClick={(e) => {
          e.stopPropagation();
          if (!filling) onFill();
        }}
        title={t('toolbar.fill')}
      >
        <span>&#x26A1;</span>
        <span>{filling ? '...' : t('toolbar.fill')}</span>
      </button>
      <button
        style={progressBtnStyle}
        onClick={(e) => {
          e.stopPropagation();
          if (fillResult) onToggleResult();
        }}
        title={fillResult ? t('toolbar.result') : t('toolbar.progress')}
      >
        {fillResult ? `${fillResult.filled}/${fillResult.total}` : '\u2014'}
      </button>
      <button
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          backgroundColor: saveMenuOpen ? '#6b7280' : '#4b5563',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          padding: '6px 10px',
          fontSize: '13px',
          cursor: 'pointer',
          outline: 'none',
          whiteSpace: 'nowrap',
        }}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSaveMenu();
        }}
        title={t('toolbar.save')}
      >
        &#x1F4BE;
      </button>
    </div>
  );
}
