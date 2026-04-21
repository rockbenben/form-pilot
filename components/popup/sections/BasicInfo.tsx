import React from 'react';
import type { BasicInfo } from '@/lib/storage/types';
import { FormField, TagListField } from '../FormField';
import { useI18n } from '@/lib/i18n';

interface BasicInfoProps {
  data: BasicInfo;
  onChange: (patch: Partial<BasicInfo>) => void;
}

export default function BasicInfoSection({ data, onChange }: BasicInfoProps) {
  const { t } = useI18n();

  const updateSocialLink = (key: string, value: string) => {
    const updated = { ...data.socialLinks };
    if (value.trim()) {
      updated[key] = value;
    } else {
      delete updated[key];
    }
    onChange({ socialLinks: updated });
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
        <FormField
          label={t('basic.phone')}
          value={data.phone[0]?.value ?? ''}
          onChange={() => { /* TODO(Phase B Task 13): replace with CandidateListField */ }}
          placeholder="138xxxxxxxx"
        />
        <FormField
          label={t('basic.email')}
          value={data.email[0]?.value ?? ''}
          onChange={() => { /* TODO(Phase B Task 13): replace with CandidateListField */ }}
          placeholder="user@example.com"
        />
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
