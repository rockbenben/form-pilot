import React from 'react';
import type { CustomField } from '@/lib/storage/types';
import { useI18n } from '@/lib/i18n';

interface CustomFieldsProps {
  data: CustomField[];
  onChange: (items: CustomField[]) => void;
}

const inputBase =
  'bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors';

export default function CustomFieldsSection({ data, onChange }: CustomFieldsProps) {
  const { t } = useI18n();

  const handleAdd = () => {
    onChange([...data, { key: '', value: '' }]);
  };

  const handleDelete = (index: number) => {
    onChange(data.filter((_, i) => i !== index));
  };

  const handleChange = (index: number, field: keyof CustomField, value: string) => {
    onChange(
      data.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    );
  };

  return (
    <div>
      <div className="space-y-2">
        {data.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              className={inputBase + ' w-28 shrink-0'}
              value={item.key}
              onChange={(e) => handleChange(index, 'key', e.target.value)}
              placeholder={t('custom.key')}
            />
            <input
              type="text"
              className={inputBase + ' flex-1'}
              value={item.value}
              onChange={(e) => handleChange(index, 'value', e.target.value)}
              placeholder={t('custom.value')}
            />
            <button
              type="button"
              onClick={() => handleDelete(index)}
              className="text-gray-600 hover:text-red-400 text-lg leading-none transition-colors shrink-0"
              title={t('array.delete')}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={handleAdd}
        className="mt-2 w-full py-1.5 text-xs text-gray-500 border border-dashed border-gray-700 rounded hover:border-blue-500 hover:text-blue-400 transition-colors"
      >
        {t('custom.add')}
      </button>
    </div>
  );
}
