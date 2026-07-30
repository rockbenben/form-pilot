import './style.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Resume, ResumePatch } from '@/lib/storage/types';
import { I18nContext, useI18nProvider } from '@/lib/i18n';
import {
  createResume,
  deleteResume,
  exportResume,
  getActiveResumeId,
  listResumes,
  renameResume,
  setActiveResumeId,
  updateResume,
} from '@/lib/storage/resume-store';

import { coalescePendingPatch } from './coalesce-patch';
import { mergeResumePatch } from '@/lib/storage/merge-resume-patch';
import Sidebar, { type SectionId } from '@/components/popup/Sidebar';
import ResumeSelector from '@/components/popup/ResumeSelector';
import StatusBar from '@/components/popup/StatusBar';
import ImportDialog from '@/components/popup/ImportDialog';
import SectionErrorBoundary from '@/components/popup/SectionErrorBoundary';

import BasicInfoSection from '@/components/popup/sections/BasicInfo';
import EducationSection from '@/components/popup/sections/Education';
import WorkSection from '@/components/popup/sections/Work';
import ProjectsSection from '@/components/popup/sections/Projects';
import SkillsSection from '@/components/popup/sections/Skills';
import JobPreferenceSection from '@/components/popup/sections/JobPreference';
import CustomFieldsSection from '@/components/popup/sections/CustomFields';
import SettingsSection from '@/components/popup/sections/Settings';
import SavedPagesSection from '@/components/popup/sections/SavedPages';

export default function App() {
  const i18n = useI18nProvider();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [section, setSection] = useState<SectionId>('basic');
  const [showImport, setShowImport] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // ─── Pending save refs (debounce race-condition fix) ──────────────────────
  const pendingRef = useRef<{ id: string; patch: ResumePatch } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const loadResumes = useCallback(async () => {
    const [all, storedActiveId] = await Promise.all([
      listResumes(),
      getActiveResumeId(),
    ]);
    setResumes(all);
    if (all.length > 0) {
      const resolvedId =
        storedActiveId && all.find((r) => r.meta.id === storedActiveId)
          ? storedActiveId
          : all[0].meta.id;
      setActiveId(resolvedId);
    }
  }, []);

  const refreshActiveResume = useCallback(async () => {
    if (!activeId) return;
    const all = await listResumes();
    setResumes(all);
  }, [activeId]);

  const activeResume = resumes.find((r) => r.meta.id === activeId) ?? null;

  // ─── Hash routing on mount ────────────────────────────────────────────────

  const VALID_SECTIONS: SectionId[] = [
    'basic', 'education', 'work', 'projects', 'skills',
    'jobPreference', 'custom', 'savedPages', 'settings',
  ];

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && (VALID_SECTIONS as string[]).includes(hash)) {
      setSection(hash as SectionId);
    }
  }, []);

  // Reflect section changes in the URL hash. Skip the very first render —
  // otherwise a deep link (#settings) flickers to the initial state's hash
  // (#basic) before the hash-read effect's setSection has committed.
  const didSyncHash = useRef(false);
  useEffect(() => {
    if (!didSyncHash.current) {
      didSyncHash.current = true;
      return;
    }
    if (typeof window === 'undefined') return;
    if (window.location.hash.slice(1) !== section) {
      window.history.replaceState(null, '', `#${section}`);
    }
  }, [section]);

  // Browser back / forward / manual URL edit → update the rendered section.
  useEffect(() => {
    function onHashChange() {
      const h = window.location.hash.slice(1);
      if ((VALID_SECTIONS as string[]).includes(h)) {
        setSection(h as SectionId);
      }
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // ─── Cleanup pending-save timer on unmount ────────────────────────────────
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  // ─── Load on mount ────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const [all, storedActiveId] = await Promise.all([
        listResumes(),
        getActiveResumeId(),
      ]);

      if (all.length === 0) {
        const created = await createResume(i18n.t('resume.default'));
        setResumes([created]);
        setActiveId(created.meta.id);
        await setActiveResumeId(created.meta.id);
      } else {
        setResumes(all);
        const resolvedId =
          storedActiveId && all.find((r) => r.meta.id === storedActiveId)
            ? storedActiveId
            : all[0].meta.id;
        setActiveId(resolvedId);
      }
    }
    init();
  }, []);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const flushPendingSave = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) return;
    clearTimeout(timerRef.current);
    // Keep the pending patch buffered until the write actually succeeds — if we
    // nulled it first and updateResume rejected, the user's in-flight edit would
    // be silently lost with no timer left to retry it.
    await updateResume(pending.id, pending.patch);
    // Success. Clear only if a newer edit hasn't superseded it during the await.
    if (pendingRef.current === pending) {
      pendingRef.current = null;
      // The debounce timer that would normally clear the 'saving' indicator was
      // just cancelled, so drive the status transition here instead. Guard the
      // idle flip so a later edit (status back to 'saving') isn't overwritten.
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 1500);
    }
  }, []);

  const handleSelectResume = useCallback(async (id: string) => {
    await flushPendingSave();
    setActiveId(id);
    await setActiveResumeId(id);
  }, [flushPendingSave]);

  const handleCreateResume = useCallback(async () => {
    // Flush any in-flight field edit before switching active resume, or the
    // pending debounce (keyed to the old resume) gets cancelled by the next
    // edit and its patch is dropped — same guard the other switch handlers use.
    await flushPendingSave();
    const name = `${i18n.t('resume.default')} ${resumes.length + 1}`;
    const created = await createResume(name);
    setResumes((prev) => [...prev, created]);
    setActiveId(created.meta.id);
    await setActiveResumeId(created.meta.id);
  }, [flushPendingSave, resumes.length]);

  const handleUpdate = useCallback(
    (patch: ResumePatch) => {
      if (!activeId) return;
      setResumes((prev) =>
        prev.map((r) =>
          r.meta.id === activeId
            ? {
                // Optimistic render. Shared merge rule keeps `basic` deep-merged
                // so the render preserves the other basic fields (and candidate
                // arrays) instead of replacing basic with just the changed key.
                ...mergeResumePatch(r, patch),
                meta: { ...r.meta, updatedAt: Date.now() },
              }
            : r,
        ),
      );
      // Merge into any patch still pending for this resume — otherwise editing
      // two different sections within the 500ms debounce window would drop the
      // earlier section's patch (only the last top-level key would be written).
      pendingRef.current = coalescePendingPatch(pendingRef.current, activeId, patch);
      clearTimeout(timerRef.current);
      setSaveStatus('saving');
      timerRef.current = setTimeout(async () => {
        if (pendingRef.current) {
          const { id, patch: p } = pendingRef.current;
          pendingRef.current = null;
          await updateResume(id, p);
          setSaveStatus('saved');
          // Guard the idle flip so it can't override a newer edit that already
          // moved the status back to 'saving' within this 1.5s window.
          setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 1500);
        }
      }, 500);
    },
    [activeId],
  );

  const handleDeleteResume = useCallback(async (id: string) => {
    await flushPendingSave();
    await deleteResume(id);
    // Re-read instead of filtering local state: `resumes` can be stale if
    // another tab changed the list, and deriving from it would drop whatever
    // that tab added. `deleteResume` owns repointing the active profile, so
    // there is nothing to decide here — just reflect what storage now says.
    const [remaining, nextActive] = await Promise.all([listResumes(), getActiveResumeId()]);
    setResumes(remaining);
    setActiveId(nextActive);
  }, [flushPendingSave]);

  const handleRenameResume = useCallback(async (id: string, newName: string) => {
    // Flush any in-flight field edit first so the debounced updateResume
    // doesn't race the rename by writing a stale meta.name back.
    await flushPendingSave();
    try {
      const updated = await renameResume(id, newName);
      setResumes((prev) => prev.map((r) => (r.meta.id === id ? updated : r)));
    } catch (err) {
      console.error('Rename failed:', err);
    }
  }, [flushPendingSave]);

  const handleExport = useCallback(async () => {
    if (!activeId) return;
    try {
      const json = await exportResume(activeId);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const resume = resumes.find((r) => r.meta.id === activeId);
      a.download = `${resume?.meta.name ?? 'profile'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  }, [activeId, resumes]);

  // ─── Render section content ───────────────────────────────────────────────

  function renderContent() {
    if (section === 'settings') {
      return <SettingsSection />;
    }

    if (section === 'savedPages') {
      return <SavedPagesSection />;
    }

    if (!activeResume) {
      return (
        <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
          {i18n.t('popup.noResume')}
        </div>
      );
    }

    switch (section) {
      case 'basic':
        return (
          <BasicInfoSection
            data={activeResume.basic}
            // Send only the changed scalar delta (not a full `basic` snapshot):
            // candidate arrays (phone/email + pinned ids) are owned by the
            // out-of-band mutation path, and a stale full snapshot taken mid-edit
            // could otherwise overwrite a just-added candidate. handleUpdate /
            // coalesce / updateResume deep-merge the `basic` key to preserve them.
            onChange={(patch) => handleUpdate({ basic: patch })}
            flushPendingSave={flushPendingSave}
            refreshFromStorage={refreshActiveResume}
          />
        );
      case 'education':
        return (
          <EducationSection
            data={activeResume.education}
            onChange={(items) => handleUpdate({ education: items })}
          />
        );
      case 'work':
        return (
          <WorkSection
            data={activeResume.work}
            onChange={(items) => handleUpdate({ work: items })}
          />
        );
      case 'projects':
        return (
          <ProjectsSection
            data={activeResume.projects}
            onChange={(items) => handleUpdate({ projects: items })}
          />
        );
      case 'skills':
        return (
          <SkillsSection
            data={activeResume.skills}
            onChange={(patch) => handleUpdate({ skills: { ...activeResume.skills, ...patch } })}
          />
        );
      case 'jobPreference':
        return (
          <JobPreferenceSection
            data={activeResume.jobPreference}
            onChange={(patch) =>
              handleUpdate({ jobPreference: { ...activeResume.jobPreference, ...patch } })
            }
          />
        );
      case 'custom':
        return (
          <CustomFieldsSection
            data={activeResume.custom}
            onChange={(items) => handleUpdate({ custom: items })}
          />
        );
      default:
        return null;
    }
  }

  // ─── JSX ──────────────────────────────────────────────────────────────────

  return (
    <I18nContext.Provider value={i18n}>
    <div className="min-h-screen bg-gray-950 text-gray-200 flex flex-col">
      {/* Top header */}
      <div className="shrink-0 border-b border-gray-800 bg-gray-950">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-4">
          <span className="text-base font-bold text-blue-400">⚡ {i18n.t('app.name')}</span>
          <span className="text-sm text-gray-500 hidden sm:inline">{i18n.t('app.subtitle')}</span>
          <div className="flex-1" />
          {/* Save indicator */}
          {saveStatus === 'saving' && <span className="text-xs text-gray-500">{i18n.t('status.saving')}</span>}
          {saveStatus === 'saved' && <span className="text-xs text-green-500">{i18n.t('status.saved')}</span>}
          {/* Resume selector in header */}
          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
            <ResumeSelector
              resumes={resumes}
              activeId={activeId}
              onSelect={handleSelectResume}
              onCreate={handleCreateResume}
              onDelete={handleDeleteResume}
              onRename={handleRenameResume}
            />
          </div>
          {/* Settings — always reachable from the header */}
          <button
            onClick={() => setSection('settings')}
            title={i18n.t('nav.settings')}
            className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1
              ${section === 'settings'
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              }`}
          >
            <span>⚙️</span>
            <span className="hidden sm:inline">{i18n.t('nav.settings')}</span>
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 max-w-5xl mx-auto w-full">
        {/* Sidebar — sticky */}
        <div className="sticky top-0 h-screen">
          <Sidebar active={section} onChange={setSection} className="w-48 h-full" />
        </div>

        {/* Content area */}
        <div className="flex-1 flex flex-col min-w-0 min-h-screen">
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="max-w-3xl">
              {/* Scoped to the content area so a section that throws leaves the
                  sidebar standing. It used to take the whole tree down: black
                  page, no nav, no way back to a section that still worked. */}
              <SectionErrorBoundary
                resetKey={section}
                fallbackTitle={i18n.t('section.error.title')}
                fallbackHint={i18n.t('section.error.hint')}
              >
                {renderContent()}
              </SectionErrorBoundary>
            </div>
          </div>

          {/* Status bar — sticky at bottom */}
          <div className="sticky bottom-0">
            <StatusBar
              resume={activeResume}
              onImport={() => setShowImport(true)}
              onExport={handleExport}
            />
          </div>
        </div>
      </div>

      {/* Import dialog */}
      {showImport && (
        <ImportDialog
          onClose={() => setShowImport(false)}
          onImported={async () => {
            setShowImport(false);
            await loadResumes();
          }}
        />
      )}
    </div>
    </I18nContext.Provider>
  );
}
