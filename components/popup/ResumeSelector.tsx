import React, { useEffect, useRef, useState } from 'react';
import { EditIcon } from '@/lib/ui/icons';
import type { Resume } from '@/lib/storage/types';
import { useI18n } from '@/lib/i18n';
import { successorAfterDelete } from '@/lib/storage/resume-store';
import { countFields } from '@/lib/storage/resume-utils';

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
  const [pendingDelete, setPendingDelete] = useState<Resume | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);


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
    setPendingDelete(null);
  }

  function cancelRename() {
    setEditingId(null);
  }

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-line bg-canvas overflow-x-auto shrink-0">
      {resumes.map((r) => {
        const isActive = activeId === r.meta.id;
        const isEditing = editingId === r.meta.id;
        return (
          <div
            key={r.meta.id}
            className={`flex items-center gap-0.5 rounded-lg whitespace-nowrap transition-colors
              ${isActive
                ? 'bg-primary-hover text-on-primary'
                : 'bg-fill text-ink2 hover:bg-fill-hover hover:text-ink'
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
                className="px-2 py-1 text-xs bg-sunken text-ink border border-primary rounded-lg outline-none w-32"
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
                  className={`pe-1 text-[10px] leading-none transition-opacity
                    ${isActive ? 'text-on-primary opacity-70 hover:opacity-100' : 'text-ink2 opacity-50 hover:opacity-100'}`}
                >
                  <EditIcon size={12} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setPendingDelete(r); }}
                  className={`pe-2 ps-0.5 text-xs leading-none transition-opacity opacity-60 hover:opacity-100
                    ${isActive ? 'text-on-primary' : 'text-ink2'}`}
                  title={t('resume.delete')}
                >
                  ×
                </button>
              </>
            )}
          </div>
        );
      })}
      <button
        onClick={onCreate}
        className="px-3 py-1 text-xs rounded-lg bg-fill text-ink2 hover:bg-fill-hover hover:text-link whitespace-nowrap transition-colors"
      >
        {t('resume.new')}
      </button>

      {pendingDelete && (
        <DeleteDialog
          resume={pendingDelete}
          successor={successorAfterDelete(resumes, pendingDelete.meta.id)}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => { onDelete(pendingDelete.meta.id); setPendingDelete(null); }}
        />
      )}
    </div>
  );
}

/**
 * Deleting a profile destroys work the user cannot get back, so it asks in
 * words rather than by mode-switching a 12px 「×」 into a 「?」 that silently
 * reverted after three seconds — a confirmation nobody could read, on a
 * control nobody could aim at, next to the rename pencil.
 *
 * It names the profile, says how much is in it, and names the profile that
 * takes over, because deleting the active one switches you somewhere else and
 * that used to happen with nothing on screen saying so.
 */
function DeleteDialog({
  resume,
  successor,
  onCancel,
  onConfirm,
}: {
  resume: Resume;
  successor: Resume | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const { filled } = countFields(resume);
  const name = resume.meta.name || t('resume.default');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-80 rounded-lg border border-line bg-sunken shadow-xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-ink">{t('resume.delete.title')}</h2>
        </div>
        <div className="px-4 py-3 space-y-2 text-xs leading-relaxed text-ink">
          <p>{t('resume.delete.body', { name, filled })}</p>
          {successor ? (
            <p className="text-ink2">
              {t('resume.delete.successor', { name: successor.meta.name || t('resume.default') })}
            </p>
          ) : (
            <p className="text-warning">{t('resume.delete.last')}</p>
          )}
        </div>
        <div className="px-4 py-3 flex justify-end gap-2 border-t border-line">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs text-ink hover:bg-fill transition-colors
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {t('resume.delete.cancel')}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-danger text-on-primary hover:bg-danger
              transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
          >
            {t('resume.delete.confirmBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
