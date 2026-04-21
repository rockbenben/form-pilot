import React from 'react';
import { useI18n } from '@/lib/i18n';

export type SectionId =
  | 'basic'
  | 'education'
  | 'work'
  | 'projects'
  | 'skills'
  | 'jobPreference'
  | 'custom'
  | 'savedPages'
  | 'settings';

interface SidebarProps {
  active: SectionId;
  onChange: (id: SectionId) => void;
  /** Override default width class (default: "w-28") */
  className?: string;
}

export default function Sidebar({ active, onChange, className }: SidebarProps) {
  const { t } = useI18n();

  const NAV_ITEMS = [
    { id: 'basic' as SectionId, label: t('nav.basic') },
    { id: 'education' as SectionId, label: t('nav.education') },
    { id: 'work' as SectionId, label: t('nav.work') },
    { id: 'projects' as SectionId, label: t('nav.projects') },
    { id: 'skills' as SectionId, label: t('nav.skills') },
    { id: 'jobPreference' as SectionId, label: t('nav.jobPreference') },
    { id: 'custom' as SectionId, label: t('nav.custom') },
    { id: 'savedPages' as SectionId, label: t('nav.savedPages') },
  ];

  return (
    <div className={`${className ?? 'w-28'} flex flex-col border-r border-gray-800 bg-gray-950 shrink-0`}>
      <div className="flex-1 py-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`w-full text-left px-3 py-2 text-xs rounded-none transition-colors
              ${active === item.id
                ? 'bg-blue-500/20 text-blue-400 border-r-2 border-blue-400'
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="border-t border-gray-800">
        <button
          onClick={() => onChange('settings')}
          className={`w-full text-left px-3 py-2 text-xs rounded-none transition-colors
            ${active === 'settings'
              ? 'bg-blue-500/20 text-blue-400 border-r-2 border-blue-400'
              : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
            }`}
        >
          {t('nav.settings')}
        </button>
      </div>
    </div>
  );
}
