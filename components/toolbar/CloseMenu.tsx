import React, { useEffect, useRef } from 'react';

export interface CloseMenuProps {
  t: (key: string) => string;
  onHidePage: () => void;
  onNeverSite: () => void;
  onClose: () => void;
}

const menuStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '100%',
  right: 0,
  marginBottom: '6px',
  backgroundColor: '#1e1e3a',
  borderRadius: '8px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
  padding: '4px',
  minWidth: '150px',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  zIndex: 999999,
};

const itemStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#e5e7eb',
  fontSize: '12px',
  textAlign: 'left',
  padding: '7px 10px',
  borderRadius: '5px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

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
    <div ref={ref} style={menuStyle} onMouseDown={(e) => e.stopPropagation()}>
      <button style={itemStyle} onClick={(e) => { e.stopPropagation(); onHidePage(); }}>
        {t('toolbar.close.thisPage')}
      </button>
      <button style={itemStyle} onClick={(e) => { e.stopPropagation(); onNeverSite(); }}>
        {t('toolbar.close.thisSite')}
      </button>
    </div>
  );
}
