import React from 'react';
import type { ProjectEntry } from '@/lib/storage/types';
import { FormField, TagListField } from '../FormField';
import ArraySection from '../ArraySection';
import { useI18n } from '@/lib/i18n';

interface ProjectsProps {
  data: ProjectEntry[];
  onChange: (items: ProjectEntry[]) => void;
}

function createEmptyProject(): ProjectEntry {
  return {
    name: '',
    role: '',
    startDate: '',
    endDate: '',
    link: '',
    description: '',
    techStack: [],
  };
}

export default function ProjectsSection({ data, onChange }: ProjectsProps) {
  const { t } = useI18n();

  const getTitle = (entry: ProjectEntry, index: number): string => {
    if (entry.name) {
      return `${entry.name}${entry.role ? ' · ' + entry.role : ''}`;
    }
    return `${t('projects.title')} ${index + 1}`;
  };

  return (
    <ArraySection<ProjectEntry>
      items={data}
      onUpdate={onChange}
      createEmpty={createEmptyProject}
      getTitle={getTitle}
      renderItem={(item, patch) => (
        <div>
          <div className="grid grid-cols-2 gap-x-3">
            <FormField
              label={t('projects.name')}
              value={item.name}
              onChange={(v) => patch({ name: v })}
            />
            <FormField
              label={t('projects.role')}
              value={item.role}
              onChange={(v) => patch({ role: v })}
            />
            <FormField
              label={t('projects.startDate')}
              value={item.startDate}
              onChange={(v) => patch({ startDate: v })}
              type="month"
            />
            <FormField
              label={t('projects.endDate')}
              value={item.endDate}
              onChange={(v) => patch({ endDate: v })}
              type="month"
            />
          </div>
          <FormField
            label={t('projects.link')}
            value={item.link}
            onChange={(v) => patch({ link: v })}
            placeholder="https://github.com/..."
          />
          <FormField
            label={t('projects.description')}
            value={item.description}
            onChange={(v) => patch({ description: v })}
            type="textarea"
            rows={4}
          />
          <TagListField
            label={t('projects.techStack')}
            tags={item.techStack}
            onChange={(v) => patch({ techStack: v })}
            placeholder={t('tag.placeholder')}
          />
        </div>
      )}
    />
  );
}
