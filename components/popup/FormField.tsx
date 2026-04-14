import { useState } from 'react';
import React from 'react';

// ─── Base field styles ────────────────────────────────────────────────────────

const inputBase =
  'w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors';

const labelBase = 'block text-xs text-gray-400 mb-1';

// ─── FormField ────────────────────────────────────────────────────────────────

interface FormFieldProps {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: 'text' | 'date' | 'number' | 'textarea' | 'month';
  placeholder?: string;
  rows?: number;
}

export function FormField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  rows = 3,
}: FormFieldProps) {
  return (
    <div className="mb-3">
      <label className={labelBase}>{label}</label>
      {type === 'textarea' ? (
        <textarea
          className={inputBase + ' resize-none'}
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
        />
      ) : (
        <input
          type={type}
          className={inputBase}
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

// ─── TagListField ─────────────────────────────────────────────────────────────

interface TagListFieldProps {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

export function TagListField({
  label,
  tags,
  onChange,
  placeholder,
}: TagListFieldProps) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput('');
  };

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <div className="mb-3">
      <label className={labelBase}>{label}</label>
      <div className="flex flex-wrap gap-1 mb-1">
        {tags.map((tag, i) => (
          <span
            key={i}
            className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(i)}
              className="text-blue-400 hover:text-red-400 transition-colors leading-none"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        className={inputBase}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
    </div>
  );
}
