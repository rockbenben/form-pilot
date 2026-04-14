import React, { useState } from 'react';
import { useI18n } from '@/lib/i18n';

interface ArraySectionProps<T> {
  items: T[];
  onUpdate: (items: T[]) => void;
  renderItem: (item: T, onChange: (patch: Partial<T>) => void) => React.ReactNode;
  createEmpty: () => T;
  getTitle: (item: T, index: number) => string;
}

export default function ArraySection<T>({
  items,
  onUpdate,
  renderItem,
  createEmpty,
  getTitle,
}: ArraySectionProps<T>) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<number | null>(items.length > 0 ? 0 : null);

  const handleAdd = () => {
    const newItems = [...items, createEmpty()];
    onUpdate(newItems);
    setExpanded(newItems.length - 1);
  };

  const handleDelete = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    onUpdate(newItems);
    if (expanded === index) {
      setExpanded(newItems.length > 0 ? Math.max(0, index - 1) : null);
    } else if (expanded !== null && expanded > index) {
      setExpanded(expanded - 1);
    }
  };

  const handleChange = (index: number, patch: Partial<T>) => {
    const newItems = items.map((item, i) =>
      i === index ? { ...item, ...patch } : item,
    );
    onUpdate(newItems);
  };

  const toggleExpand = (index: number) => {
    setExpanded(expanded === index ? null : index);
  };

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="border border-gray-800 rounded bg-gray-900">
          <div
            className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-800 transition-colors"
            onClick={() => toggleExpand(index)}
          >
            <span className="text-xs text-gray-300 truncate flex-1">
              {getTitle(item, index)}
            </span>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(index);
                }}
                className="text-gray-600 hover:text-red-400 text-sm transition-colors"
                title={t('array.delete')}
              >
                ×
              </button>
              <span className="text-gray-600 text-xs">
                {expanded === index ? '▲' : '▼'}
              </span>
            </div>
          </div>
          {expanded === index && (
            <div className="px-3 pb-3 pt-1 border-t border-gray-800">
              {renderItem(item, (patch) => handleChange(index, patch))}
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={handleAdd}
        className="w-full py-1.5 text-xs text-gray-500 border border-dashed border-gray-700 rounded hover:border-blue-500 hover:text-blue-400 transition-colors"
      >
        {t('array.add')}
      </button>
    </div>
  );
}
