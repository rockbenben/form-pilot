import React, { useEffect } from 'react';
import { CheckIcon, WarnIcon, CloseIcon, BoltIcon } from '@/lib/ui/icons';

interface ToolbarToastProps {
  message: string;
  variant?: 'info' | 'success' | 'warn' | 'error';
  onDismiss: () => void;
  /** ms before auto-dismissing; default 4000 */
  timeoutMs?: number;
}

const VARIANT_ICON = {
  info: BoltIcon,
  success: CheckIcon,
  warn: WarnIcon,
  error: CloseIcon,
};
const VARIANT_COLOR = {
  info: 'var(--fp-link)',
  success: 'var(--fp-filled)',
  warn: 'var(--fp-uncertain)',
  error: 'var(--fp-unrecognized)',
};

export default function ToolbarToast({
  message, variant = 'info', onDismiss, timeoutMs = 4000,
}: ToolbarToastProps) {
  useEffect(() => {
    const id = setTimeout(onDismiss, timeoutMs);
    return () => clearTimeout(id);
  }, [onDismiss, timeoutMs]);

  const Icon = VARIANT_ICON[variant];

  return (
    <div className="fp-toast" role="status" style={{ bottom: '100%', insetInlineStart: 0, marginBottom: 8 }}>
      <div className="fp-toast-row">
        <span style={{ color: VARIANT_COLOR[variant], display: 'inline-flex' }}><Icon size={15} /></span>
        <span>{message}</span>
      </div>
    </div>
  );
}
