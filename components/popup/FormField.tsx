import { useState } from 'react';
import React from 'react';
import { PRESENT, isPresent } from '@/lib/present-date';

// ─── Base field styles ────────────────────────────────────────────────────────

const inputBase =
  'w-full bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-sm text-gray-200 '
  + 'placeholder-gray-600 hover:border-gray-600 focus:outline-none focus:border-blue-500 transition-colors';

const labelBase = 'block text-xs font-medium text-gray-400 mb-1';

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
      {/* A field that is the only one in its group would otherwise print the
          group's heading twice. Pass an empty label to let the heading speak. */}
      {label ? <label className={labelBase}>{label}</label> : null}
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

// ─── EndDateField ─────────────────────────────────────────────────────────────

interface EndDateFieldProps {
  label: string;
  presentLabel: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * An end date that can also say "still here".
 *
 * A plain `<input type="month">` silently drops any value that is not a real
 * month, so the PRESENT sentinel an import writes for 「…-至今」 rendered as an
 * empty box. Nothing said the value existed, and the next edit to that entry
 * wrote the empty box back over it.
 *
 * Ticking the box stores the sentinel and takes the month input away, because
 * an entry cannot be both current and ended. Unticking restores an empty month
 * input rather than a stale date, so the user states the end date rather than
 * inheriting one.
 */
export function EndDateField({ label, presentLabel, value, onChange }: EndDateFieldProps) {
  const current = isPresent(value);
  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <label className={labelBase + ' mb-0'}>{label}</label>
        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={current}
            onChange={(e) => onChange(e.target.checked ? PRESENT : '')}
          />
          <span>{presentLabel}</span>
        </label>
      </div>
      {current ? (
        <div className={inputBase + ' text-gray-400 select-none'}>{presentLabel}</div>
      ) : (
        <input
          type="month"
          className={inputBase}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

// ─── FieldGroup ───────────────────────────────────────────────────────────────

/**
 * A titled run of related fields.
 *
 * Basic Info was 21 inputs in one undifferentiated stack — identity, contact,
 * current job status, the pitch, and links all at the same weight, so finding
 * one field meant reading all of them.
 */
export function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2.5 pb-1.5 border-b border-gray-800">
        {title}
      </h3>
      {children}
    </section>
  );
}
