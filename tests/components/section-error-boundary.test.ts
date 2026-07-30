import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import SectionErrorBoundary from '@/components/popup/SectionErrorBoundary';

let host: HTMLDivElement;
let root: Root;
let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  // React logs the caught error; keep the suite output readable.
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

function Boom(): React.ReactElement {
  throw new Error('drafts.map is not a function');
}
const Fine = () => React.createElement('p', null, 'section content');

function render(resetKey: string, child: React.ReactNode) {
  act(() => {
    root.render(
      React.createElement(SectionErrorBoundary, {
        resetKey,
        fallbackTitle: '这一页打不开',
        fallbackHint: '其余部分不受影响',
        children: child,
      }),
    );
  });
}

describe('SectionErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render('basic', React.createElement(Fine));
    expect(host.textContent).toContain('section content');
  });

  // The bug: one section throwing unmounted the whole Dashboard — no header,
  // no sidebar, no way to reach a section that still worked.
  it('contains a throwing section instead of unmounting the tree', () => {
    render('savedPages', React.createElement(Boom));
    expect(host.textContent).toContain('这一页打不开');
    expect(host.textContent).toContain('其余部分不受影响');
  });

  it('surfaces the underlying message rather than swallowing it', () => {
    render('savedPages', React.createElement(Boom));
    expect(host.textContent).toContain('drafts.map is not a function');
  });

  it('recovers when the user picks another section', () => {
    render('savedPages', React.createElement(Boom));
    expect(host.textContent).toContain('这一页打不开');
    render('basic', React.createElement(Fine));
    expect(host.textContent).toContain('section content');
    expect(host.textContent).not.toContain('这一页打不开');
  });

  it('stays in the error state while the same section is re-rendered', () => {
    render('savedPages', React.createElement(Boom));
    render('savedPages', React.createElement(Boom));
    expect(host.textContent).toContain('这一页打不开');
  });
});
