import React, { useEffect, useRef } from 'react';

interface SaveMenuProps {
  t: (key: string) => string;
  hasActiveResume: boolean;
  onSaveDraft: () => void;
  onWriteBack: () => void;
  onSaveMemory: () => void;
  onClose: () => void;
}

export default function SaveMenu({
  t, hasActiveResume, onSaveDraft, onWriteBack, onSaveMemory, onClose,
}: SaveMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      // Use composedPath so clicks inside our Shadow DOM register as "inside".
      // `e.target` is re-targeted to the shadow host for listeners on document,
      // so ref.current.contains(e.target) returns false for legitimate
      // in-menu clicks, which would incorrectly close the menu.
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [e.target];
      if (ref.current && path.includes(ref.current)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: '4px',
    backgroundColor: '#1e1e3a',
    border: '1px solid #374151',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
    minWidth: '180px',
    overflow: 'hidden',
    zIndex: 999999,
  };

  const itemStyle = (enabled: boolean): React.CSSProperties => ({
    display: 'block',
    width: '100%',
    padding: '8px 14px',
    background: 'none',
    border: 'none',
    color: enabled ? '#e5e7eb' : '#6b7280',
    textAlign: 'left',
    fontSize: '13px',
    cursor: enabled ? 'pointer' : 'not-allowed',
    whiteSpace: 'nowrap',
  });

  return (
    <div ref={ref} style={containerStyle}>
      <button
        style={itemStyle(true)}
        onClick={(e) => { e.stopPropagation(); onSaveDraft(); }}
      >
        {t('capture.menu.draft')}
      </button>
      <button
        style={itemStyle(hasActiveResume)}
        disabled={!hasActiveResume}
        title={!hasActiveResume ? t('capture.toast.noActiveResume') : undefined}
        onClick={(e) => { e.stopPropagation(); if (hasActiveResume) onWriteBack(); }}
      >
        {t('capture.menu.writeback')}
      </button>
      <button
        style={itemStyle(true)}
        onClick={(e) => { e.stopPropagation(); onSaveMemory(); }}
      >
        {t('capture.menu.memory')}
      </button>
    </div>
  );
}
