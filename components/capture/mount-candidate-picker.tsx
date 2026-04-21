// components/capture/mount-candidate-picker.tsx
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CandidatePicker, type CandidatePickerProps } from './CandidatePicker';

export interface MountCandidatePickerOpts extends CandidatePickerProps {
  target: Element;
  signature: string;
}

export interface MountedCandidatePicker {
  unmount: () => void;
  update: (next: Partial<CandidatePickerProps>) => void;
}

export function mountCandidatePicker(opts: MountCandidatePickerOpts): MountedCandidatePicker {
  const host = document.createElement('div');
  host.setAttribute('data-formpilot-picker', opts.signature);
  host.style.position = 'absolute';
  host.style.zIndex = '2147483600';
  host.style.pointerEvents = 'auto';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const mountNode = document.createElement('div');
  shadow.appendChild(mountNode);

  const reposition = () => {
    const rect = opts.target.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      host.style.display = 'none';
      return;
    }
    host.style.display = '';
    host.style.top = `${rect.top + window.scrollY + rect.height / 2 - 7}px`;
    host.style.left = `${rect.right + window.scrollX + 4}px`;
  };
  reposition();

  const onScroll = () => reposition();
  const onResize = () => reposition();
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);

  let reactRoot: Root | null = createRoot(mountNode);

  let currentProps: CandidatePickerProps = {
    candidates: opts.candidates,
    pinnedId: opts.pinnedId,
    currentCandidateId: opts.currentCandidateId,
    t: opts.t,
    onSelect: opts.onSelect,
    onPinToggle: opts.onPinToggle,
    onDelete: opts.onDelete,
    onManageAll: opts.onManageAll,
  };

  const renderNow = () => {
    if (!reactRoot) return;
    reactRoot.render(React.createElement(CandidatePicker, currentProps));
  };
  renderNow();

  return {
    unmount() {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      reactRoot?.unmount();
      reactRoot = null;
      host.remove();
    },
    update(next: Partial<CandidatePickerProps>) {
      currentProps = { ...currentProps, ...next };
      renderNow();
    },
  };
}
