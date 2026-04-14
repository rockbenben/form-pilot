import React from 'react';
import type { JobPreference } from '@/lib/storage/types';
import { FormField, TagListField } from '../FormField';
import { useI18n } from '@/lib/i18n';

interface JobPreferenceProps {
  data: JobPreference;
  onChange: (patch: Partial<JobPreference>) => void;
}

export default function JobPreferenceSection({ data, onChange }: JobPreferenceProps) {
  const { t } = useI18n();

  return (
    <div>
      <TagListField
        label={t('jobPref.positions')}
        tags={data.positions}
        onChange={(v) => onChange({ positions: v })}
        placeholder={t('tag.placeholder')}
      />
      <TagListField
        label={t('jobPref.industries')}
        tags={data.industries}
        onChange={(v) => onChange({ industries: v })}
        placeholder={t('tag.placeholder')}
      />
      <FormField
        label={t('jobPref.salaryRange')}
        value={data.salaryRange}
        onChange={(v) => onChange({ salaryRange: v })}
      />
      <FormField
        label={t('jobPref.jobType')}
        value={data.jobType}
        onChange={(v) => onChange({ jobType: v })}
      />
      <FormField
        label={t('jobPref.availableDate')}
        value={data.availableDate}
        onChange={(v) => onChange({ availableDate: v })}
        type="date"
      />
    </div>
  );
}
