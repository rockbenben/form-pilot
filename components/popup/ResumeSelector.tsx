import React, { useState } from 'react';
import type { Resume } from '@/lib/storage/types';
import { useI18n } from '@/lib/i18n';

interface ResumeSelectorProps {
  resumes: Resume[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

export default function ResumeSelector({
  resumes,
  activeId,
  onSelect,
  onCreate,
  onDelete,
}: ResumeSelectorProps) {
  const { t } = useI18n();
  const canDelete = resumes.length > 1;
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function handleDeleteClick(id: string) {
    if (confirmDeleteId === id) {
      onDelete(id);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  }

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-800 bg-gray-950 overflow-x-auto shrink-0">
      {resumes.map((r) => (
        <div
          key={r.meta.id}
          className={`flex items-center gap-0.5 rounded whitespace-nowrap transition-colors
            ${activeId === r.meta.id
              ? 'bg-blue-500 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
        >
          <button
            onClick={() => onSelect(r.meta.id)}
            className="px-3 py-1 text-xs"
          >
            {r.meta.name || t('resume.default')}
          </button>
          {canDelete && (
            <button
              onClick={() => handleDeleteClick(r.meta.id)}
              className={`pr-2 text-xs leading-none transition-colors
                ${confirmDeleteId === r.meta.id
                  ? 'text-red-400 opacity-100 font-bold'
                  : `opacity-60 hover:opacity-100 ${activeId === r.meta.id ? 'text-white' : 'text-gray-400'}`
                }`}
              title={confirmDeleteId === r.meta.id ? t('resume.delete.confirm') : t('resume.delete')}
            >
              {confirmDeleteId === r.meta.id ? '?' : '×'}
            </button>
          )}
        </div>
      ))}
      <button
        onClick={onCreate}
        className="px-3 py-1 text-xs rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-blue-400 whitespace-nowrap transition-colors"
      >
        {t('resume.new')}
      </button>
    </div>
  );
}
