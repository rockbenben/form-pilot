// entrypoints/background.ts
export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse);
    return true;
  });
});

async function handleMessage(message: { type: string; [key: string]: unknown }) {
  const { getResume, getActiveResumeId, updateResume } = await import('@/lib/storage/resume-store');
  const { getSettings, updateSettings } = await import('@/lib/storage/settings-store');
  const draftStore = await import('@/lib/storage/draft-store');
  const memStore = await import('@/lib/storage/page-memory-store');
  const formStore = await import('@/lib/storage/form-store');
  const { applyWriteback } = await import('@/lib/capture/writeback');

  switch (message.type) {
    case 'GET_ACTIVE_RESUME': {
      const id = await getActiveResumeId();
      if (!id) return { ok: true, data: null };
      return { ok: true, data: await getResume(id) };
    }

    // Single round-trip used by content.ts::handleFill. Folds what would
    // otherwise be 3 separate chrome.runtime.sendMessage calls
    // (GET_ACTIVE_RESUME, GET_PAGE_MEMORY, GET_FORM_ENTRIES) into one.
    case 'GET_FILL_CONTEXT': {
      const { memoryUrl, pageDomain } = (message as unknown) as {
        memoryUrl?: string;
        pageDomain?: string;
      };
      const id = await getActiveResumeId();
      const domainPrefsStore = await import('@/lib/storage/domain-prefs-store');
      const profileDomainPrefsStore = await import('@/lib/storage/profile-domain-prefs-store');
      const [resume, memory, formEntries, domainPrefs, profileDomainPrefs] = await Promise.all([
        id ? getResume(id) : Promise.resolve(null),
        memoryUrl ? memStore.getPageMemory(memoryUrl) : Promise.resolve([]),
        formStore.listFormEntries(),
        domainPrefsStore.listFieldDomainPrefs(),
        id ? profileDomainPrefsStore.listForResume(id) : Promise.resolve({}),
      ]);
      return {
        ok: true,
        data: {
          resume, memory, formEntries, domainPrefs,
          currentDomain: pageDomain ?? '',
          profileDomainPrefs,
        },
      };
    }
    case 'GET_SETTINGS':
      return { ok: true, data: await getSettings() };
    case 'SAVE_TOOLBAR_POSITION': {
      const position = message.position as { x: number; y: number };
      await updateSettings({ toolbarPosition: position });
      return { ok: true, data: null };
    }

    // ── Drafts ───────────────────────────────────────────────────────────
    case 'SAVE_DRAFT': {
      const { url, fields } = (message as unknown) as { url: string; fields: unknown };
      try {
        await draftStore.saveDraft(url, fields as never);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    }
    case 'GET_DRAFT': {
      const { url } = (message as unknown) as { url: string };
      return { ok: true, data: await draftStore.getDraft(url) };
    }
    case 'DELETE_DRAFT': {
      const { url } = (message as unknown) as { url: string };
      await draftStore.deleteDraft(url);
      return { ok: true };
    }
    case 'LIST_DRAFTS':
      return { ok: true, data: await draftStore.listDrafts() };

    // ── Page Memory (also fans out to the cross-URL form-entry store) ────
    case 'SAVE_PAGE_MEMORY': {
      const { url, fields } = (message as unknown) as {
        url: string;
        fields: Parameters<typeof memStore.savePageMemory>[1];
      };
      try {
        const saved = await memStore.savePageMemory(url, fields);
        // Mirror to the cross-URL form store so the same field on another
        // site can be auto-filled without a per-URL memory entry.
        await formStore.saveFormEntries(fields, url);
        return { ok: true, data: { saved } };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    }
    case 'GET_PAGE_MEMORY': {
      const { url } = (message as unknown) as { url: string };
      return { ok: true, data: await memStore.getPageMemory(url) };
    }
    case 'DELETE_PAGE_MEMORY': {
      const { url } = (message as unknown) as { url: string };
      await memStore.deletePageMemory(url);
      return { ok: true };
    }
    case 'LIST_PAGE_MEMORY':
      return { ok: true, data: await memStore.listPageMemory() };

    // ── Cross-URL form entries (signature-keyed) ─────────────────────────
    case 'GET_FORM_ENTRIES':
      return { ok: true, data: await formStore.listFormEntries() };
    case 'LIST_FORM_ENTRIES':
      return { ok: true, data: await formStore.listFormEntries() };
    case 'DELETE_FORM_ENTRY': {
      const { signature } = (message as unknown) as { signature: string };
      await formStore.deleteFormEntry(signature);
      return { ok: true };
    }
    case 'CLEAR_FORM_ENTRIES':
      await formStore.clearAllFormEntries();
      return { ok: true };

    case 'DELETE_FORM_CANDIDATE': {
      const { signature, candidateId } = (message as unknown) as {
        signature: string;
        candidateId: string;
      };
      await formStore.deleteCandidate(signature, candidateId);
      return { ok: true };
    }
    case 'UPDATE_FORM_CANDIDATE': {
      const { signature, candidateId, value, displayValue } = (message as unknown) as {
        signature: string;
        candidateId: string;
        value: string;
        displayValue?: string;
      };
      await formStore.updateCandidate(signature, candidateId, value, displayValue);
      return { ok: true };
    }
    case 'ADD_FORM_CANDIDATE': {
      const { signature, value, displayValue } = (message as unknown) as {
        signature: string;
        value: string;
        displayValue?: string;
      };
      const newId = await formStore.addCandidate(signature, value, displayValue);
      return { ok: true, data: { id: newId } };
    }
    case 'SET_FORM_PIN': {
      const { signature, candidateId } = (message as unknown) as {
        signature: string;
        candidateId: string | null;
      };
      await formStore.setFormPin(signature, candidateId);
      return { ok: true };
    }
    case 'BUMP_FORM_HIT': {
      const { signature, candidateId, sourceUrl } = (message as unknown) as {
        signature: string;
        candidateId: string;
        sourceUrl: string;
      };
      await formStore.bumpCandidateHit(signature, candidateId, sourceUrl);
      return { ok: true };
    }
    case 'LIST_DOMAIN_PREFS': {
      const domainPrefsStore = await import('@/lib/storage/domain-prefs-store');
      return { ok: true, data: await domainPrefsStore.listFieldDomainPrefs() };
    }
    case 'SET_DOMAIN_PREF': {
      const { signature, domain, candidateId } = (message as unknown) as {
        signature: string;
        domain: string;
        candidateId: string;
      };
      const domainPrefsStore = await import('@/lib/storage/domain-prefs-store');
      await domainPrefsStore.setDomainPref(signature, domain, candidateId);
      return { ok: true };
    }
    case 'CLEAR_DOMAIN_PREF': {
      const { signature, domain } = (message as unknown) as {
        signature: string;
        domain: string;
      };
      const domainPrefsStore = await import('@/lib/storage/domain-prefs-store');
      await domainPrefsStore.clearDomainPref(signature, domain);
      return { ok: true };
    }

    // ── Write-back to resume ─────────────────────────────────────────────
    case 'WRITE_BACK_TO_RESUME': {
      const { pairs, sourceUrl } = (message as unknown) as {
        pairs: { resumePath: string; value: string }[];
        sourceUrl?: string;
      };
      const id = await getActiveResumeId();
      if (!id) return { ok: false, error: 'no active resume' };
      const resume = await getResume(id);
      if (!resume) return { ok: false, error: 'active resume not found' };

      // Split pairs: profile multi-value paths go through upsertProfileCandidate,
      // everything else through the legacy applyWriteback.
      const profilePaths = new Set(['basic.phone', 'basic.email']);
      const profilePairs = pairs.filter((p) => profilePaths.has(p.resumePath));
      const legacyPairs = pairs.filter((p) => !profilePaths.has(p.resumePath));

      if (profilePairs.length > 0) {
        const { upsertProfileCandidate } = await import('@/lib/storage/profile-candidates');
        for (const { resumePath, value } of profilePairs) {
          if (!value) continue;
          await upsertProfileCandidate(
            id,
            resumePath as 'basic.phone' | 'basic.email',
            value,
            sourceUrl ?? '',
          );
        }
      }

      if (legacyPairs.length > 0) {
        const updated = applyWriteback(resume, legacyPairs);
        const { meta: _m, ...patch } = updated;
        await updateResume(id, patch);
      }

      return { ok: true, data: { updated: pairs.length, name: resume.meta.name } };
    }

    case 'BUMP_PROFILE_HIT': {
      const { resumePath, candidateId, sourceUrl } = (message as unknown) as {
        resumePath: 'basic.phone' | 'basic.email';
        candidateId: string;
        sourceUrl: string;
      };
      const id = await getActiveResumeId();
      if (!id) return { ok: false, error: 'no active resume' };
      const { bumpProfileCandidateHit } = await import('@/lib/storage/profile-candidates');
      await bumpProfileCandidateHit(id, resumePath, candidateId, sourceUrl);
      return { ok: true };
    }
    case 'SET_PROFILE_PIN': {
      const { resumePath, candidateId } = (message as unknown) as {
        resumePath: 'basic.phone' | 'basic.email';
        candidateId: string | null;
      };
      const id = await getActiveResumeId();
      if (!id) return { ok: false, error: 'no active resume' };
      const { setProfilePin } = await import('@/lib/storage/profile-candidates');
      await setProfilePin(id, resumePath, candidateId);
      return { ok: true };
    }
    case 'ADD_PROFILE_CANDIDATE': {
      const { resumePath, value, label } = (message as unknown) as {
        resumePath: 'basic.phone' | 'basic.email';
        value: string;
        label: string;
      };
      const id = await getActiveResumeId();
      if (!id) return { ok: false, error: 'no active resume' };
      const { addProfileCandidate } = await import('@/lib/storage/profile-candidates');
      const newId = await addProfileCandidate(id, resumePath, value, label);
      return { ok: true, data: { id: newId } };
    }
    case 'UPDATE_PROFILE_CANDIDATE': {
      const { resumePath, candidateId, value, label } = (message as unknown) as {
        resumePath: 'basic.phone' | 'basic.email';
        candidateId: string;
        value: string;
        label: string;
      };
      const id = await getActiveResumeId();
      if (!id) return { ok: false, error: 'no active resume' };
      const { updateProfileCandidate } = await import('@/lib/storage/profile-candidates');
      await updateProfileCandidate(id, resumePath, candidateId, value, label);
      return { ok: true };
    }
    case 'DELETE_PROFILE_CANDIDATE': {
      const { resumePath, candidateId } = (message as unknown) as {
        resumePath: 'basic.phone' | 'basic.email';
        candidateId: string;
      };
      const id = await getActiveResumeId();
      if (!id) return { ok: false, error: 'no active resume' };
      const { deleteProfileCandidate } = await import('@/lib/storage/profile-candidates');
      await deleteProfileCandidate(id, resumePath, candidateId);
      return { ok: true };
    }
    case 'SET_PROFILE_DOMAIN_PREF': {
      const { resumePath, domain, candidateId } = (message as unknown) as {
        resumePath: 'basic.phone' | 'basic.email';
        domain: string;
        candidateId: string;
      };
      const id = await getActiveResumeId();
      if (!id) return { ok: false, error: 'no active resume' };
      const { setProfileDomainPref } = await import('@/lib/storage/profile-domain-prefs-store');
      await setProfileDomainPref(id, resumePath, domain, candidateId);
      return { ok: true };
    }
    case 'CLEAR_PROFILE_DOMAIN_PREF': {
      const { resumePath, domain } = (message as unknown) as {
        resumePath: 'basic.phone' | 'basic.email';
        domain: string;
      };
      const id = await getActiveResumeId();
      if (!id) return { ok: false, error: 'no active resume' };
      const { clearProfileDomainPref } = await import('@/lib/storage/profile-domain-prefs-store');
      await clearProfileDomainPref(id, resumePath, domain);
      return { ok: true };
    }
    case 'LIST_PROFILE_DOMAIN_PREFS': {
      const id = await getActiveResumeId();
      if (!id) return { ok: true, data: {} };
      const { listForResume } = await import('@/lib/storage/profile-domain-prefs-store');
      return { ok: true, data: await listForResume(id) };
    }

    default:
      return { ok: false, error: `Unknown message type: ${message.type}` };
  }
}
