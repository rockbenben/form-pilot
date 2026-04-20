import React, { useEffect } from 'react';

interface ToolbarToastProps {
  message: string;
  variant?: 'info' | 'success' | 'warn' | 'error';
  onDismiss: () => void;
  /** ms before auto-dismissing; default 4000 */
  timeoutMs?: number;
}

const VARIANT_BG: Record<NonNullable<ToolbarToastProps['variant']>, string> = {
  info: '#1e1e3a',
  success: '#166534',
  warn: '#92400e',
  error: '#7f1d1d',
};

export default function ToolbarToast({
  message, variant = 'info', onDismiss, timeoutMs = 4000,
}: ToolbarToastProps) {
  useEffect(() => {
    const id = setTimeout(onDismiss, timeoutMs);
    return () => clearTimeout(id);
  }, [onDismiss, timeoutMs]);

  const style: React.CSSProperties = {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    marginBottom: '8px',
    backgroundColor: VARIANT_BG[variant],
    color: '#fff',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    maxWidth: '260px',
    whiteSpace: 'normal',
    zIndex: 999999,
  };

  return <div style={style}>{message}</div>;
}
