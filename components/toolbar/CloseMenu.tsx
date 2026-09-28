import React, { useEffect, useRef } from 'react';
import { CloseIcon, BlockIcon } from '@/lib/ui/icons';

export interface CloseMenuProps {
  t: (key: string) => string;
  onHidePage: () => void;
  onNeverSite: () => void;
  onClose: () => void;
}

export default function CloseMenu({ t, onHidePage, onNeverSite, onClose }: CloseMenuProps) {
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
    <div
      ref={ref}
      className="fp-menu"
      style={{ bottom: '100%', insetInlineEnd: 0, marginBottom: 6 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button className="fp-menu-item" onClick={(e) => { e.stopPropagation(); onHidePage(); }}>
        <CloseIcon size={15} />
        {t('toolbar.close.thisPage')}
      </button>
      <button className="fp-menu-item" onClick={(e) => { e.stopPropagation(); onNeverSite(); }}>
        <BlockIcon size={15} />
        {t('toolbar.close.thisSite')}
      </button>
    </div>
  );
}
