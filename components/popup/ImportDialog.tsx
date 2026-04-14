import React, { useRef, useState } from 'react';
import { importResume } from '@/lib/storage/resume-store';
import { extractResumeFields, toResume } from '@/lib/import/resume-extractor';
import { extractTextFromPdf } from '@/lib/import/pdf-parser';
import { extractTextFromWord } from '@/lib/import/word-parser';
import { createEmptyResume } from '@/lib/storage/types';
import { useI18n } from '@/lib/i18n';

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 'json' | 'resume';

interface Props {
  onClose: () => void;
  onImported: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ImportDialog({ onClose, onImported }: Props) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('json');
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetMessages() {
    setStatus('');
    setError('');
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  function triggerFileInput() {
    resetMessages();
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset so the same file can be re-selected
    e.target.value = '';

    setLoading(true);
    resetMessages();

    try {
      if (mode === 'json') {
        await handleJsonFile(file);
      } else {
        await handleResumeFile(file);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('import.error.format'));
    } finally {
      setLoading(false);
    }
  }

  async function handleJsonFile(file: File) {
    const text = await file.text();
    await importResume(text);
    setStatus(`${t('import.success.json')}: "${file.name}"`);
    onImported();
  }

  async function handleResumeFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const arrayBuffer = await file.arrayBuffer();

    let text = '';
    if (ext === 'pdf') {
      text = await extractTextFromPdf(arrayBuffer);
    } else if (ext === 'docx' || ext === 'doc') {
      text = await extractTextFromWord(arrayBuffer);
    } else {
      throw new Error(t('import.error.format'));
    }

    if (!text.trim()) {
      throw new Error(t('import.error.format'));
    }

    const extracted = extractResumeFields(text);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const resumeName = extracted.basic.name || file.name.replace(/\.[^.]+$/, '');
    const resume = toResume(extracted, id, resumeName);

    // Build a complete Resume by merging with an empty template
    const base = createEmptyResume(id, resumeName);
    const fullResume = {
      ...base,
      basic: { ...base.basic, ...resume.basic },
      education: resume.education,
      skills: { ...base.skills, ...resume.skills },
    };

    await importResume(JSON.stringify(fullResume));
    setStatus(`${t('import.success.resume')}: "${file.name}"${extracted.basic.name ? ` (${extracted.basic.name})` : ''}`);
    onImported();
  }

  // ─── Accept string ──────────────────────────────────────────────────────────

  const acceptAttr = mode === 'json' ? '.json' : '.pdf,.doc,.docx';

  // ─── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={handleOverlayClick}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-80 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <span className="text-sm font-semibold text-gray-200">{t('import.title')}</span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 text-lg leading-none transition-colors"
            aria-label={t('import.close')}
          >
            ×
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => { setMode('json'); resetMessages(); }}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              mode === 'json'
                ? 'bg-gray-800 text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t('import.json')}
          </button>
          <button
            onClick={() => { setMode('resume'); resetMessages(); }}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              mode === 'resume'
                ? 'bg-gray-800 text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t('import.resume')}
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-3">
          <p className="text-xs text-gray-400">
            {mode === 'json'
              ? t('import.json')
              : t('import.resume')}
          </p>

          {/* Drop / click area */}
          <button
            onClick={triggerFileInput}
            disabled={loading}
            className={`w-full border border-dashed border-gray-600 rounded-md py-6 text-xs text-gray-400
              hover:border-blue-500 hover:text-blue-400 transition-colors
              ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {loading ? t('import.parsing') : t('import.click')}
          </button>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptAttr}
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Status */}
          {status && (
            <p className="text-xs text-green-400 bg-green-400/10 rounded px-2 py-1">
              {status}
            </p>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 rounded px-2 py-1">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
