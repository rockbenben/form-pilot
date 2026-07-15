import React, { useCallback, useEffect, useState } from 'react';
import type { BasicInfo } from '@/lib/storage/types';
import { FormField, TagListField } from '../FormField';
import CandidateListField from '../CandidateListField';
import { useI18n } from '@/lib/i18n';

interface BasicInfoProps {
  data: BasicInfo;
  onChange: (patch: Partial<BasicInfo>) => void;
  /**
   * Flush any debounced field edit to storage before a candidate mutation
   * runs. Candidate add/edit/delete/pin write `basic` out-of-band in the
   * background; without flushing first, the pending field-edit snapshot (taken
   * before the candidate change) would later overwrite it and drop the change.
   */
  flushPendingSave: () => Promise<void>;
  refreshFromStorage: () => Promise<void>;
}

export default function BasicInfoSection({ data, onChange, flushPendingSave, refreshFromStorage }: BasicInfoProps) {
  const { t } = useI18n();
  const [profileDomainPrefs, setProfileDomainPrefs] = useState<Record<string, Record<string, string>>>({});

  const refreshPrefs = useCallback(async () => {
    const res = await chrome.runtime.sendMessage({ type: 'LIST_PROFILE_DOMAIN_PREFS' });
    setProfileDomainPrefs(res?.ok ? (res.data as Record<string, Record<string, string>>) : {});
  }, []);

  useEffect(() => { refreshPrefs(); }, [refreshPrefs]);

  const updateSocialLink = (key: string, value: string) => {
    const updated = { ...data.socialLinks };
    if (value.trim()) {
      updated[key] = value;
    } else {
      delete updated[key];
    }
    onChange({ socialLinks: updated });
  };

  const withRefresh = async (msg: Record<string, unknown>) => {
    // Persist any in-flight field edit first so the debounced write can't later
    // clobber the candidate mutation we're about to make (and vice versa).
    // Guard the whole chain: if the flush write rejects, sendMessage would never
    // run and the candidate op would silently no-op via an unhandled rejection.
    try {
      await flushPendingSave();
      await chrome.runtime.sendMessage(msg);
    } catch (err) {
      console.error('Candidate mutation failed:', err);
    } finally {
      // Always resync from storage so the UI reflects what actually persisted —
      // on failure the list repaints without the candidate instead of leaving
      // the optimistically cleared input implying the add succeeded.
      await refreshFromStorage();
    }
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-3">
        <FormField
          label={t('basic.name')}
          value={data.name}
          onChange={(v) => onChange({ name: v })}
          placeholder="张三"
        />
        <FormField
          label={t('basic.nameEn')}
          value={data.nameEn}
          onChange={(v) => onChange({ nameEn: v })}
          placeholder="San Zhang"
        />
      </div>
      <CandidateListField
        label={t('basic.phone')}
        candidates={data.phone}
        pinnedId={data.phonePinnedId}
        domainPrefs={profileDomainPrefs['basic.phone'] ?? {}}
        valueInputPlaceholder={t('profile.candidate.valuePlaceholder.phone')}
        onAdd={async (value, label) => {
          await withRefresh({ type: 'ADD_PROFILE_CANDIDATE', resumePath: 'basic.phone', value, label });
        }}
        onUpdate={async (id, value, label) => {
          await withRefresh({ type: 'UPDATE_PROFILE_CANDIDATE', resumePath: 'basic.phone', candidateId: id, value, label });
        }}
        onDelete={async (id) => {
          await withRefresh({ type: 'DELETE_PROFILE_CANDIDATE', resumePath: 'basic.phone', candidateId: id });
          await refreshPrefs();
        }}
        onSetPin={async (id) => {
          await withRefresh({ type: 'SET_PROFILE_PIN', resumePath: 'basic.phone', candidateId: id });
        }}
        onClearDomainPref={async (domain) => {
          await chrome.runtime.sendMessage({ type: 'CLEAR_PROFILE_DOMAIN_PREF', resumePath: 'basic.phone', domain });
          await refreshPrefs();
        }}
      />
      <CandidateListField
        label={t('basic.email')}
        candidates={data.email}
        pinnedId={data.emailPinnedId}
        domainPrefs={profileDomainPrefs['basic.email'] ?? {}}
        valueInputPlaceholder={t('profile.candidate.valuePlaceholder.email')}
        onAdd={async (value, label) => {
          await withRefresh({ type: 'ADD_PROFILE_CANDIDATE', resumePath: 'basic.email', value, label });
        }}
        onUpdate={async (id, value, label) => {
          await withRefresh({ type: 'UPDATE_PROFILE_CANDIDATE', resumePath: 'basic.email', candidateId: id, value, label });
        }}
        onDelete={async (id) => {
          await withRefresh({ type: 'DELETE_PROFILE_CANDIDATE', resumePath: 'basic.email', candidateId: id });
          await refreshPrefs();
        }}
        onSetPin={async (id) => {
          await withRefresh({ type: 'SET_PROFILE_PIN', resumePath: 'basic.email', candidateId: id });
        }}
        onClearDomainPref={async (domain) => {
          await chrome.runtime.sendMessage({ type: 'CLEAR_PROFILE_DOMAIN_PREF', resumePath: 'basic.email', domain });
          await refreshPrefs();
        }}
      />
      <div className="grid grid-cols-2 gap-x-3">
        <FormField
          label={t('basic.gender')}
          value={data.gender}
          onChange={(v) => onChange({ gender: v })}
        />
        <FormField
          label={t('basic.birthday')}
          value={data.birthday}
          onChange={(v) => onChange({ birthday: v })}
          type="date"
        />
        <FormField
          label={t('basic.nationality')}
          value={data.nationality}
          onChange={(v) => onChange({ nationality: v })}
        />
        <FormField
          label={t('basic.ethnicity')}
          value={data.ethnicity}
          onChange={(v) => onChange({ ethnicity: v })}
        />
        <FormField
          label={t('basic.politicalStatus')}
          value={data.politicalStatus}
          onChange={(v) => onChange({ politicalStatus: v })}
        />
        <FormField
          label={t('basic.location')}
          value={data.location}
          onChange={(v) => onChange({ location: v })}
        />
      </div>
      <TagListField
        label={t('basic.willingLocations')}
        tags={data.willingLocations}
        onChange={(v) => onChange({ willingLocations: v })}
        placeholder={t('tag.placeholder')}
      />
      <p className="text-xs text-gray-500 mb-2">{t('basic.socialLinks')}</p>
      <FormField
        label={t('basic.socialLinks.github')}
        value={data.socialLinks['github'] ?? ''}
        onChange={(v) => updateSocialLink('github', v)}
        placeholder="https://github.com/username"
      />
      <FormField
        label={t('basic.socialLinks.linkedin')}
        value={data.socialLinks['linkedin'] ?? ''}
        onChange={(v) => updateSocialLink('linkedin', v)}
        placeholder="https://linkedin.com/in/username"
      />
      <FormField
        label={t('basic.socialLinks.portfolio')}
        value={data.socialLinks['portfolio'] ?? ''}
        onChange={(v) => updateSocialLink('portfolio', v)}
        placeholder="https://yoursite.com"
      />
    </div>
  );
}
