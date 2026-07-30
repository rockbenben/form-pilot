import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { EndDateField } from '@/components/popup/FormField';
import { PRESENT } from '@/lib/present-date';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

function render(value: string, onChange: (v: string) => void) {
  act(() => {
    root.render(
      React.createElement(EndDateField, { label: '结束日期', presentLabel: '至今', value, onChange }),
    );
  });
}

const checkbox = () => host.querySelector<HTMLInputElement>('input[type=checkbox]')!;
const monthInput = () => host.querySelector<HTMLInputElement>('input[type=month]');

describe('EndDateField', () => {
  // The bug: `<input type="month">` silently drops any value that is not a real
  // month, so an imported 「…-至今」 rendered as an empty box and the next edit
  // to that entry wrote the empty box back over it.
  it('shows a stored PRESENT sentinel instead of an empty month box', () => {
    render(PRESENT, () => {});
    expect(checkbox().checked).toBe(true);
    expect(monthInput()).toBeNull();          // no box that could round-trip to ''
    expect(host.textContent).toContain('至今');
  });

  it('shows a real month value in an editable month input', () => {
    render('2021-03', () => {});
    expect(checkbox().checked).toBe(false);
    expect(monthInput()!.value).toBe('2021-03');
  });

  it('stores the sentinel — not the display text — when ticked', () => {
    const seen: string[] = [];
    render('2021-03', (v) => seen.push(v));
    act(() => { checkbox().click(); });
    expect(seen).toEqual([PRESENT]);
    expect(seen[0]).not.toBe('至今');
  });

  // Unticking must not hand back a date the user never re-confirmed.
  it('clears to empty when unticked rather than restoring a stale date', () => {
    const seen: string[] = [];
    render(PRESENT, (v) => seen.push(v));
    act(() => { checkbox().click(); });
    expect(seen).toEqual(['']);
  });

  it('round-trips: a value in, the same value out', () => {
    let value = PRESENT;
    render(value, (v) => { value = v; });
    expect(value).toBe(PRESENT);
  });
});
