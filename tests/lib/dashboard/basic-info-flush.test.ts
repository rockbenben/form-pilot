import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import BasicInfoSection from '@/components/popup/sections/BasicInfo';
import { createEmptyResume } from '@/lib/storage/types';

// Real component regression test for Bug 2:
//   BasicInfo candidate mutations write `basic` out-of-band in the background.
//   They MUST flush any debounced field edit FIRST, or the pending field-edit
//   snapshot (taken before the candidate change) later overwrites it and drops
//   the candidate. The fix awaits flushPendingSave() before sendMessage().
//
// This drives the real "add phone candidate" UI and asserts the call order.
// Remove `await flushPendingSave()` from withRefresh and this test fails.

// jsdom needs this for React 18 act().
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const callLog: string[] = [];

beforeEach(() => {
  callLog.length = 0;
  const chromeAny = (globalThis as unknown as { chrome: Record<string, unknown> }).chrome;
  chromeAny.runtime = {
    id: 'test',
    sendMessage: vi.fn(async (msg: { type: string }) => {
      callLog.push(`send:${msg.type}`);
      return { ok: true, data: {} };
    }),
  };
});

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function clickByText(container: HTMLElement, text: string, which = 0) {
  const btns = Array.from(container.querySelectorAll('button')).filter(
    (b) => b.textContent?.trim() === text,
  );
  const btn = btns[which];
  if (!btn) throw new Error(`button "${text}" [${which}] not found`);
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('BasicInfo — flush before candidate write (Bug 2 regression)', () => {
  it('awaits flushPendingSave before sending ADD_PROFILE_CANDIDATE', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root;

    const flushPendingSave = vi.fn(async () => { callLog.push('flush'); });
    const refreshFromStorage = vi.fn(async () => {});
    const onChange = vi.fn();

    await act(async () => {
      root = createRoot(container);
      root.render(
        createElement(BasicInfoSection, {
          data: createEmptyResume('r1', 'R').basic,
          onChange,
          flushPendingSave,
          refreshFromStorage,
        }),
      );
    });

    // Open the phone candidate "add" form (phone is the first CandidateListField).
    await act(async () => { clickByText(container, 'profile.candidate.add', 0); });

    // Type a phone value into the add form's value input.
    const valueInput = container.querySelector<HTMLInputElement>(
      'input[placeholder="profile.candidate.valuePlaceholder.phone"]',
    );
    expect(valueInput).not.toBeNull();
    await act(async () => { setInputValue(valueInput!, '13800138000'); });

    // Submit the add.
    await act(async () => { clickByText(container, 'profile.candidate.save', 0); });
    // let the awaited withRefresh chain settle
    await act(async () => { await Promise.resolve(); });

    const flushIdx = callLog.indexOf('flush');
    const addIdx = callLog.indexOf('send:ADD_PROFILE_CANDIDATE');

    expect(flushPendingSave).toHaveBeenCalledTimes(1);
    expect(addIdx).toBeGreaterThanOrEqual(0);          // the add was actually sent
    expect(flushIdx).toBeGreaterThanOrEqual(0);        // flush happened
    expect(flushIdx).toBeLessThan(addIdx);             // …and strictly before the add
    expect(refreshFromStorage).toHaveBeenCalled();     // refresh runs after

    await act(async () => { root.unmount(); });
    container.remove();
  });
});
