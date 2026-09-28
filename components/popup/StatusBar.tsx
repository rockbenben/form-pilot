import React from 'react';
import type { Resume } from '@/lib/storage/types';
import { useI18n } from '@/lib/i18n';
import { countFields } from '@/lib/storage/resume-utils';
import { STATUS_COLORS } from '@/lib/ui/field-status';

interface StatusBarProps {
  resume: Resume | null;
  onImport: () => void;
  onExport: () => void;
}

export default function StatusBar({ resume, onImport, onExport }: StatusBarProps) {
  const { t } = useI18n();

  if (!resume) {
    return (
      <div className="flex items-center justify-between px-3 py-2 border-t border-line bg-canvas shrink-0">
        <span className="text-xs text-ink2">{t('popup.noResume')}</span>
        <div className="flex gap-2">
          <button
            onClick={onImport}
            className="px-2 py-1 text-xs bg-fill text-ink2 rounded-lg hover:bg-fill-hover hover:text-ink transition-colors"
          >
            {t('status.import')}
          </button>
        </div>
      </div>
    );
  }

  const { filled, total } = countFields(resume);
  const missing = total - filled;

  return (
    <div className="flex items-center justify-between px-3 py-2 border-t border-line bg-canvas shrink-0 gap-3">
      {/* Same two segments and the same colours as the popup's bar. The old
          version graded one bar green/blue/amber by percentage, which made the
          bar's colour mean "how complete" here and "which field state" there —
          two meanings for one visual signal across two surfaces of one product. */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="flex flex-1 max-w-[200px] h-1.5 gap-px rounded-full overflow-hidden bg-fill">
          {[
            { key: 'filled', n: filled, color: STATUS_COLORS.filled },
            { key: 'missing', n: missing, color: STATUS_COLORS.empty },
          ].map((s) =>
            s.n === 0 ? null : (
              <div key={s.key} style={{ width: `${(s.n / total) * 100}%`, backgroundColor: s.color }} />
            ),
          )}
        </div>
        <span className="flex items-baseline gap-1 text-xs shrink-0 whitespace-nowrap">
          <span className="font-semibold tabular-nums" style={{ color: STATUS_COLORS.filled }}>{filled}</span>
          <span className="text-ink2">{t('popup.stat.filled')}</span>
          {missing > 0 && (
            <>
              <span className="ms-1.5 font-semibold tabular-nums" style={{ color: STATUS_COLORS.empty }}>{missing}</span>
              <span className="text-ink2">{t('popup.stat.missing')}</span>
            </>
          )}
        </span>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={onImport}
          className="px-2 py-1 text-xs bg-fill text-ink2 rounded-lg hover:bg-fill-hover hover:text-ink transition-colors"
        >
          {t('status.import')}
        </button>
        <button
          onClick={onExport}
          className="px-2 py-1 text-xs bg-fill text-ink2 rounded-lg hover:bg-fill-hover hover:text-ink transition-colors"
        >
          {t('status.export')}
        </button>
      </div>
    </div>
  );
}
