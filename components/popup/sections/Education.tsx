import React from 'react';
import type { EducationEntry } from '@/lib/storage/types';
import { FormField, TagListField } from '../FormField';
import ArraySection from '../ArraySection';
import { useI18n } from '@/lib/i18n';

interface EducationProps {
  data: EducationEntry[];
  onChange: (items: EducationEntry[]) => void;
}

function createEmptyEducation(): EducationEntry {
  return {
    school: '',
    schoolEn: '',
    degree: '',
    major: '',
    majorEn: '',
    gpa: '',
    gpaScale: '',
    startDate: '',
    endDate: '',
    honors: [],
  };
}

export default function EducationSection({ data, onChange }: EducationProps) {
  const { t } = useI18n();

  const getTitle = (entry: EducationEntry, index: number): string => {
    if (entry.school) {
      return `${entry.school}${entry.degree ? ' · ' + entry.degree : ''}`;
    }
    return `${t('education.title')} ${index + 1}`;
  };

  return (
    <ArraySection<EducationEntry>
      items={data}
      onUpdate={onChange}
      createEmpty={createEmptyEducation}
      getTitle={getTitle}
      renderItem={(item, patch) => (
        <div>
          <div className="grid grid-cols-2 gap-x-3">
            <FormField
              label={t('education.school')}
              value={item.school}
              onChange={(v) => patch({ school: v })}
              placeholder="Peking University"
            />
            <FormField
              label={t('education.schoolEn')}
              value={item.schoolEn}
              onChange={(v) => patch({ schoolEn: v })}
              placeholder="Peking University"
            />
            <FormField
              label={t('education.degree')}
              value={item.degree}
              onChange={(v) => patch({ degree: v })}
            />
            <FormField
              label={t('education.major')}
              value={item.major}
              onChange={(v) => patch({ major: v })}
              placeholder="Computer Science"
            />
            <FormField
              label={t('education.majorEn')}
              value={item.majorEn}
              onChange={(v) => patch({ majorEn: v })}
              placeholder="Computer Science"
            />
            <div className="flex gap-2">
              <div className="flex-1">
                <FormField
                  label={t('education.gpa')}
                  value={item.gpa}
                  onChange={(v) => patch({ gpa: v })}
                  placeholder="3.8"
                />
              </div>
              <div className="flex-1">
                <FormField
                  label={t('education.gpaScale')}
                  value={item.gpaScale}
                  onChange={(v) => patch({ gpaScale: v })}
                  placeholder="4.0"
                />
              </div>
            </div>
            <FormField
              label={t('education.startDate')}
              value={item.startDate}
              onChange={(v) => patch({ startDate: v })}
              type="month"
            />
            <FormField
              label={t('education.endDate')}
              value={item.endDate}
              onChange={(v) => patch({ endDate: v })}
              type="month"
            />
          </div>
          <TagListField
            label={t('education.honors')}
            tags={item.honors}
            onChange={(v) => patch({ honors: v })}
            placeholder={t('tag.placeholder')}
          />
        </div>
      )}
    />
  );
}
