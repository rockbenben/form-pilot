import React from 'react';
import type { Resume } from '@/lib/storage/types';
import { useI18n } from '@/lib/i18n';
import { countFields } from '@/lib/storage/resume-utils';

interface StatusBarProps {
  resume: Resume | null;
  onImport: () => void;
  onExport: () => void;
}

export default function StatusBar({ resume, onImport, onExport }: StatusBarProps) {
  const { t } = useI18n();

  if (!resume) {
    return (
      <div className="flex items-center justify-between px-3 py-2 border-t border-gray-800 bg-gray-950 shrink-0">
        <span className="text-xs text-gray-500">{t('popup.noResume')}</span>
        <div className="flex gap-2">
          <button
            onClick={onImport}
            className="px-2 py-1 text-xs bg-gray-800 text-gray-400 rounded hover:bg-gray-700 hover:text-gray-200 transition-colors"
          >
            {t('status.import')}
          </button>
        </div>
      </div>
    );
  }

  const { filled, total } = countFields(resume);
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  const barColor = pct >= 80 ? 'bg-green-500' : pct >= 40 ? 'bg-blue-500' : 'bg-amber-500';

  return (
    <div className="flex items-center justify-between px-3 py-2 border-t border-gray-800 bg-gray-950 shrink-0 gap-3">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
          {t('popup.progress', { filled, total, pct })}
        </span>
        <div className="flex-1 max-w-[160px] h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={onImport}
          className="px-2 py-1 text-xs bg-gray-800 text-gray-400 rounded hover:bg-gray-700 hover:text-gray-200 transition-colors"
        >
          {t('status.import')}
        </button>
        <button
          onClick={onExport}
          className="px-2 py-1 text-xs bg-gray-800 text-gray-400 rounded hover:bg-gray-700 hover:text-gray-200 transition-colors"
        >
          {t('status.export')}
        </button>
      </div>
    </div>
  );
}
