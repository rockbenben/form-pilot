import React from 'react';
import type { FillResult } from '@/lib/engine/adapters/types';
import { STATUS_COLORS, STATUS_ICONS } from '@/lib/ui/field-status';

interface ResultBubbleProps {
  result: FillResult;
  onClose: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export default function ResultBubble({ result, onClose, t }: ResultBubbleProps) {
  // Only fields FormPilot actually recognized are worth listing. An
  // `unrecognized` row is a page input that was never ours to fill — listing
  // those buried the actionable rows under noise.
  const actionableItems = result.items
    .filter((item) => item.status === 'empty' || item.status === 'uncertain')
    .slice(0, 6);

  const bubbleStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    marginBottom: '8px',
    backgroundColor: '#1e1e3a',
    borderRadius: '8px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    padding: '12px',
    minWidth: '200px',
    maxWidth: '280px',
    zIndex: 999999,
    color: '#e5e7eb',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '12px',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  };

  const closeBtnStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '0',
    lineHeight: 1,
  };

  const statsRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: '12px',
    marginBottom: '8px',
  };

  const statStyle = (color: string): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    color,
    fontWeight: 600,
  });

  const dividerStyle: React.CSSProperties = {
    borderTop: '1px solid #374151',
    marginBottom: '8px',
  };

  const itemRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '4px',
    fontSize: '11px',
    color: '#9ca3af',
  };

  return (
    <div style={bubbleStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 600, color: '#e5e7eb' }}>{t('toolbar.result')}</span>
        <button style={closeBtnStyle} onClick={onClose} title={t('import.close')}>
          ✕
        </button>
      </div>

      <div style={statsRowStyle}>
        <span style={statStyle(STATUS_COLORS.filled)} title={t('toolbar.filled')}>
          {STATUS_ICONS.filled} {result.filled}
        </span>
        <span style={statStyle(STATUS_COLORS.uncertain)} title={t('toolbar.uncertain')}>
          {STATUS_ICONS.uncertain} {result.uncertain}
        </span>
        <span style={statStyle(STATUS_COLORS.empty)} title={t('toolbar.empty')}>
          {STATUS_ICONS.empty} {result.empty}
        </span>
      </div>

      {result.empty > 0 && (
        <div style={{ ...itemRowStyle, color: '#93c5fd', marginBottom: '8px' }}>
          {t('toolbar.empty.hint')}
        </div>
      )}

      {actionableItems.length > 0 && (
        <>
          <div style={dividerStyle} />
          <div>
            {actionableItems.map((item, i) => (
              <div key={i} style={itemRowStyle}>
                <span>{STATUS_ICONS[item.status]}</span>
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '200px',
                  }}
                >
                  {item.label || item.resumePath || 'Unknown field'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {result.unrecognized > 0 && (
        <div style={{ ...itemRowStyle, color: '#6b7280', marginBottom: 0, marginTop: '6px' }}>
          {t('toolbar.unrecognized.note', { n: result.unrecognized })}
        </div>
      )}
    </div>
  );
}
