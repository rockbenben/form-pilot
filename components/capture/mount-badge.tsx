import React from 'react';
import ReactDOM from 'react-dom/client';
import DraftBadge from './DraftBadge';
import type { DraftSnapshot } from '@/lib/capture/types';
import { makeT } from '@/lib/i18n';

export interface DraftBadgeMountOptions {
  ctx: InstanceType<typeof ContentScriptContext>;
  snapshot: DraftSnapshot;
  onRestore: () => Promise<{ filled: number; total: number }>;
  onRestoreAndFill: () => Promise<{ filled: number; total: number }>;
  onIgnore: () => void;
  onDelete: () => void;
}

export async function mountDraftBadge(opts: DraftBadgeMountOptions): Promise<{ unmount: () => void }> {
  const stored = await chrome.storage.local.get('formpilot:locale');
  const locale = (stored['formpilot:locale'] === 'en') ? 'en' : 'zh';
  const t = makeT(locale);

  const ui = await createShadowRootUi(opts.ctx, {
    name: 'formpilot-draft-badge',
    position: 'inline',
    anchor: 'body',
    append: 'last',
    onMount(container) {
      const root = ReactDOM.createRoot(container);
      root.render(
        <DraftBadge
          snapshot={opts.snapshot}
          t={t}
          onRestore={opts.onRestore}
          onRestoreAndFill={opts.onRestoreAndFill}
          onIgnore={opts.onIgnore}
          onDelete={opts.onDelete}
        />,
      );
      return root;
    },
    onRemove(root) { root?.unmount(); },
  });

  ui.mount();
  return { unmount: () => ui.remove() };
}
