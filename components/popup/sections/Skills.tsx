import React from 'react';
import type { Skills } from '@/lib/storage/types';
import { TagListField } from '../FormField';
import { useI18n } from '@/lib/i18n';

interface SkillsProps {
  data: Skills;
  onChange: (patch: Partial<Skills>) => void;
}

export default function SkillsSection({ data, onChange }: SkillsProps) {
  const { t } = useI18n();

  return (
    <div>
      <TagListField
        label={t('skills.languages')}
        tags={data.languages}
        onChange={(v) => onChange({ languages: v })}
        placeholder={t('tag.placeholder')}
      />
      <TagListField
        label={t('skills.frameworks')}
        tags={data.frameworks}
        onChange={(v) => onChange({ frameworks: v })}
        placeholder={t('tag.placeholder')}
      />
      <TagListField
        label={t('skills.tools')}
        tags={data.tools}
        onChange={(v) => onChange({ tools: v })}
        placeholder={t('tag.placeholder')}
      />
      <TagListField
        label={t('skills.certificates')}
        tags={data.certificates}
        onChange={(v) => onChange({ certificates: v })}
        placeholder={t('tag.placeholder')}
      />
    </div>
  );
}
