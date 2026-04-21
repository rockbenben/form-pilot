import React, { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { Resume } from '@/lib/storage/types';
import { useI18n } from '@/lib/i18n';

interface ResumeSelectorProps {
  resumes: Resume[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
}

export default function ResumeSelector({
  resumes,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
}: ResumeSelectorProps) {
  const { t } = useI18n();
  const canDelete = resumes.length > 1;
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const confirmTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null> = useRef(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  // Clear the delete-confirm timer on unmount so no late setState fires.
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  function handleDeleteClick(id: string) {
    if (confirmDeleteId === id) {
      onDelete(id);
      setConfirmDeleteId(null);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    } else {
      setConfirmDeleteId(id);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  }

  /**
   * Relies on React firing the previous input's onBlur → commit → setState
   * BEFORE the next event (dblclick/click) that triggers beginRename. The
   * blur handler commits A's edit and clears editingId; by the time
   * beginRename runs, the state is already flushed.
   */
  function commitRename() {
    if (!editingId) return;
    const name = draftName.trim();
    if (name) {
      const original = resumes.find((r) => r.meta.id === editingId)?.meta.name ?? '';
      if (name !== original) onRename(editingId, name);
    }
    setEditingId(null);
  }

  function beginRename(r: Resume) {
    setEditingId(r.meta.id);
    setDraftName(r.meta.name || '');
    setConfirmDeleteId(null);
  }

  function cancelRename() {
    setEditingId(null);
  }

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-800 bg-gray-950 overflow-x-auto shrink-0">
      {resumes.map((r) => {
        const isActive = activeId === r.meta.id;
        const isEditing = editingId === r.meta.id;
        return (
          <div
            key={r.meta.id}
            className={`flex items-center gap-0.5 rounded whitespace-nowrap transition-colors
              ${isActive
                ? 'bg-blue-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
          >
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                  if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                }}
                maxLength={40}
                className="px-2 py-1 text-xs bg-gray-900 text-gray-100 border border-blue-400 rounded outline-none w-32"
              />
            ) : (
              <>
                <button
                  onClick={() => onSelect(r.meta.id)}
                  onDoubleClick={() => beginRename(r)}
                  title={t('resume.hint')}
                  className="px-3 py-1 text-xs"
                >
                  {r.meta.name || t('resume.default')}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); beginRename(r); }}
                  title={t('resume.rename')}
                  className={`pr-1 text-[10px] leading-none transition-opacity
                    ${isActive ? 'text-white opacity-70 hover:opacity-100' : 'text-gray-400 opacity-50 hover:opacity-100'}`}
                >
                  ✎
                </button>
                {canDelete && (
                  <button
                    onClick={() => handleDeleteClick(r.meta.id)}
                    className={`pr-2 pl-0.5 text-xs leading-none transition-colors
                      ${confirmDeleteId === r.meta.id
                        ? 'text-red-300 opacity-100 font-bold'
                        : `opacity-60 hover:opacity-100 ${isActive ? 'text-white' : 'text-gray-400'}`
                      }`}
                    title={confirmDeleteId === r.meta.id ? t('resume.delete.confirm') : t('resume.delete')}
                  >
                    {confirmDeleteId === r.meta.id ? '?' : '×'}
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
      <button
        onClick={onCreate}
        className="px-3 py-1 text-xs rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-blue-400 whitespace-nowrap transition-colors"
      >
        {t('resume.new')}
      </button>
    </div>
  );
}
