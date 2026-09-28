import React, { useEffect, useRef } from 'react';
import { SaveIcon, UndoIcon, CheckIcon } from '@/lib/ui/icons';

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

  return (
    <div ref={ref} className="fp-menu" style={{ top: '100%', insetInlineStart: 0, marginTop: 6 }}>
      <button className="fp-menu-item" onClick={(e) => { e.stopPropagation(); onSaveDraft(); }}>
        <SaveIcon size={15} />
        {t('capture.menu.draft')}
      </button>
      <button
        className="fp-menu-item"
        disabled={!hasActiveResume}
        title={!hasActiveResume ? t('capture.toast.noActiveResume') : undefined}
        onClick={(e) => { e.stopPropagation(); if (hasActiveResume) onWriteBack(); }}
      >
        <UndoIcon size={15} />
        {t('capture.menu.writeback')}
      </button>
      <button className="fp-menu-item" onClick={(e) => { e.stopPropagation(); onSaveMemory(); }}>
        <CheckIcon size={15} />
        {t('capture.menu.memory')}
      </button>
    </div>
  );
}
