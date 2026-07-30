import { describe, it, expect, beforeEach } from 'vitest';
import { fillElement } from '@/lib/engine/heuristic/fillers';

/**
 * fillCustomSelect drives JS dropdown widgets: click the trigger, then click a
 * matching option out of whatever overlay appeared. It had no tests at all.
 */
beforeEach(() => { document.body.innerHTML = ''; });

const trigger = () => {
  const t = document.createElement('div');
  t.className = 'ant-select-selector';
  document.body.appendChild(t);
  return t;
};

function overlay(opts: string[], { hidden = false } = {}): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'ant-select-dropdown';
  if (hidden) wrap.style.display = 'none';
  for (const text of opts) {
    const o = document.createElement('div');
    o.className = 'ant-select-item-option';
    o.textContent = text;
    o.addEventListener('click', () => { wrap.setAttribute('data-picked', text); });
    wrap.appendChild(o);
  }
  document.body.appendChild(wrap);
  return wrap;
}

describe('fillCustomSelect', () => {
  it('clicks the option whose text matches', async () => {
    const t = trigger();
    const panel = overlay(['北京', '上海', '广州']);
    expect(await fillElement(t, '上海', 'custom-select')).toBe(true);
    expect(panel.getAttribute('data-picked')).toBe('上海');
  });

  // Ant Design leaves a closed dropdown's panel in the DOM. Querying the whole
  // document means a stale, invisible panel from another select can win.
  it('ignores options inside a hidden overlay', async () => {
    const t = trigger();
    const stale = overlay(['上海'], { hidden: true });
    const live = overlay(['北京', '上海']);
    expect(await fillElement(t, '上海', 'custom-select')).toBe(true);
    expect(stale.getAttribute('data-picked')).toBeNull();
    expect(live.getAttribute('data-picked')).toBe('上海');
  });

  // A substring hit on an earlier option must not beat an exact hit later.
  it('prefers an exact match over a substring one', async () => {
    const t = trigger();
    const panel = overlay(['上海周边', '上海']);
    expect(await fillElement(t, '上海', 'custom-select')).toBe(true);
    expect(panel.getAttribute('data-picked')).toBe('上海');
  });

  it('reports failure when nothing matches, rather than clicking something else', async () => {
    const t = trigger();
    const panel = overlay(['北京', '广州']);
    expect(await fillElement(t, '上海', 'custom-select')).toBe(false);
    expect(panel.getAttribute('data-picked')).toBeNull();
  });
});
