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

  return (
    <div className="flex items-center justify-between px-3 py-2 border-t border-gray-800 bg-gray-950 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">
          {filled}/{total} {t('status.fields')}
        </span>
        <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-gray-500">{pct}%</span>
      </div>
      <div className="flex gap-2">
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
