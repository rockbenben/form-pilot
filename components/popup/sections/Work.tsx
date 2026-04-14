import React from 'react';
import type { WorkEntry } from '@/lib/storage/types';
import { FormField } from '../FormField';
import ArraySection from '../ArraySection';
import { useI18n } from '@/lib/i18n';

interface WorkProps {
  data: WorkEntry[];
  onChange: (items: WorkEntry[]) => void;
}

function createEmptyWork(): WorkEntry {
  return {
    company: '',
    companyEn: '',
    title: '',
    titleEn: '',
    department: '',
    location: '',
    startDate: '',
    endDate: '',
    description: '',
  };
}

export default function WorkSection({ data, onChange }: WorkProps) {
  const { t } = useI18n();

  const getTitle = (entry: WorkEntry, index: number): string => {
    if (entry.company) {
      return `${entry.company}${entry.title ? ' · ' + entry.title : ''}`;
    }
    return `${t('work.title')} ${index + 1}`;
  };

  return (
    <ArraySection<WorkEntry>
      items={data}
      onUpdate={onChange}
      createEmpty={createEmptyWork}
      getTitle={getTitle}
      renderItem={(item, patch) => (
        <div>
          <div className="grid grid-cols-2 gap-x-3">
            <FormField
              label={t('work.company')}
              value={item.company}
              onChange={(v) => patch({ company: v })}
              placeholder="Alibaba"
            />
            <FormField
              label={t('work.companyEn')}
              value={item.companyEn}
              onChange={(v) => patch({ companyEn: v })}
              placeholder="Alibaba"
            />
            <FormField
              label={t('work.jobTitle')}
              value={item.title}
              onChange={(v) => patch({ title: v })}
              placeholder="Software Engineer"
            />
            <FormField
              label={t('work.jobTitleEn')}
              value={item.titleEn}
              onChange={(v) => patch({ titleEn: v })}
              placeholder="Software Engineer"
            />
            <FormField
              label={t('work.department')}
              value={item.department}
              onChange={(v) => patch({ department: v })}
            />
            <FormField
              label={t('work.location')}
              value={item.location}
              onChange={(v) => patch({ location: v })}
            />
            <FormField
              label={t('work.startDate')}
              value={item.startDate}
              onChange={(v) => patch({ startDate: v })}
              type="month"
            />
            <FormField
              label={t('work.endDate')}
              value={item.endDate}
              onChange={(v) => patch({ endDate: v })}
              type="month"
            />
          </div>
          <FormField
            label={t('work.description')}
            value={item.description}
            onChange={(v) => patch({ description: v })}
            type="textarea"
            rows={4}
          />
        </div>
      )}
    />
  );
}
