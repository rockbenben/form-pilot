/**
 * The ▾ candidate picker's behaviour, in one place.
 *
 * Two phases mount a picker: Phase 4 (cross-URL form entries, keyed by field
 * signature) and Phase 2 (profile phone / email, keyed by resume path). Their
 * wiring was 68 lines each, and 57 of those differed only in identifier names —
 * so the three rules that are genuinely easy to get wrong lived in two copies:
 *
 *   1. Only report a hit — and only offer "remember on this domain?" — *after*
 *      the fill actually succeeded. Read-only inputs and wrong-widget fields
 *      otherwise inflate hit counts and prompt the user to remember a value
 *      they never saw written.
 *   2. The domain-pref prompt fires once per (signature, domain) per session,
 *      not once per click.
 *   3. A picker down to fewer than two candidates retires itself.
 *
 * Everything phase-specific arrives as a callback; nothing here knows which
 * phase it is serving. That is what makes the rules above unit-testable at all
 * — `entrypoints/content.ts` is not.
 */

import type { FieldCandidate } from './candidate';
import type { InputType } from '@/lib/engine/adapters/types';
import type { CandidatePickerProps } from '@/components/capture/CandidatePicker';
import {
  mountCandidatePicker,
  type MountedCandidatePicker,
} from '@/components/capture/mount-candidate-picker';
import { detectElementKind } from './element-value';
import { fillElement } from '@/lib/engine/heuristic/fillers';
import type { Locale } from '@/lib/i18n';

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Mutable view of the candidate list. Pin and delete write through this object
 * rather than through reassigned locals, so repeated opens of the same picker
 * agree with each other.
 *
 * `candidates` is deliberately *not* copied: Phase 2 hands us the live array
 * from the resume (`resume.basic.phone`), and deleting in one picker has always
 * been visible to the other picker mounted for the same path.
 */
export interface PickerState {
  candidates: FieldCandidate[];
  pinnedId: string | null;
}

export interface PickerHandlersDeps {
  /** The field the picker hangs off. */
  element: Element;
  /** Stable key for this field: picker host, pin/delete IPC, prompt key. */
  signature: string;
  currentDomain: string;
  t: Translate;
  /** `${signature}:${domain}` keys already prompted this session. */
  prompted: Set<string>;
  state: PickerState;
  /** Re-render after a state change. */
  refresh: (next: Partial<CandidatePickerProps>) => void;
  /** Tear down once fewer than two candidates remain. */
  retire: () => void;
  /** The string to write into the element for a picked candidate. */
  valueFor: (c: FieldCandidate) => string;
  /** Kind to use when the element's own kind cannot be detected. */
  fallbackKind: InputType;
  /** Text quoted in the "remember on this domain?" prompt. */
  rememberPromptValue: (c: FieldCandidate, filled: string) => string;
  /** Report a successful fill, so hit counts stay honest. */
  onBump: (c: FieldCandidate) => void;
  /** Persist "use this candidate on this domain from now on". */
  onRemember: (c: FieldCandidate) => void;
  /** Persist a pin change. */
  onPin: (candidateId: string | null) => Promise<unknown>;
  /** Persist a deletion. */
  onDelete: (candidateId: string) => Promise<unknown>;
  /** Dashboard anchor to open from "manage all". */
  manageAllHash: string;
}

export interface PickerHandlers {
  onSelect: (candidateId: string) => Promise<void>;
  onPinToggle: (candidateId: string) => Promise<void>;
  onDelete: (candidateId: string) => Promise<void>;
  onManageAll: () => void;
}

/** Pure handler factory — no DOM, no React. Everything here is unit-tested. */
export function createPickerHandlers(deps: PickerHandlersDeps): PickerHandlers {
  const { state, element, signature, currentDomain, t, prompted } = deps;

  return {
    async onSelect(candidateId) {
      const picked = state.candidates.find((c) => c.id === candidateId);
      if (!picked) return;

      const value = deps.valueFor(picked);
      // Detect the *current* element's kind. A stored kind can diverge — the
      // same signature may be rendered by a different widget on this site — and
      // phone / email can be text, tel, or a <select> for country-code splits.
      const kind = detectElementKind(element) ?? deps.fallbackKind;
      let ok = false;
      try {
        ok = await fillElement(element, value, kind);
      } catch {
        ok = false;
      }
      // Everything below is conditional on the write having landed.
      if (!ok) return;

      deps.onBump(picked);

      const promptKey = `${signature}:${currentDomain}`;
      if (prompted.has(promptKey)) return;
      prompted.add(promptKey);
      const msg = t('candidate.domainPref.rememberToast', {
        domain: currentDomain,
        value: deps.rememberPromptValue(picked, value),
      });
      if (window.confirm(msg)) deps.onRemember(picked);
    },

    async onPinToggle(candidateId) {
      const next = state.pinnedId === candidateId ? null : candidateId;
      await deps.onPin(next);
      state.pinnedId = next;
      deps.refresh({ pinnedId: next });
    },

    async onDelete(candidateId) {
      await deps.onDelete(candidateId);
      // Splice in place: Phase 2's array is shared with the resume object, and
      // an in-place delete has always been visible to a second picker mounted
      // for the same path.
      const idx = state.candidates.findIndex((c) => c.id === candidateId);
      if (idx >= 0) state.candidates.splice(idx, 1);
      if (state.pinnedId === candidateId) state.pinnedId = null;
      deps.refresh({ candidates: state.candidates, pinnedId: state.pinnedId });
      if (state.candidates.length < 2) deps.retire();
    },

    onManageAll() {
      window.open(chrome.runtime.getURL('/dashboard.html') + deps.manageAllHash, '_blank');
    },
  };
}

export interface WireCandidatePickerOpts
  extends Omit<PickerHandlersDeps, 'state' | 'refresh' | 'retire' | 'onManageAll'> {
  candidates: FieldCandidate[];
  pinnedId: string | null;
  currentCandidateId: string | null;
  /** Live list of pickers on this page; the picker removes itself when it retires. */
  mounted: MountedCandidatePicker[];
  /** UI language, forwarded so the picker knows its reading direction. */
  locale: Locale;
}

/**
 * Mount a picker and register it for teardown. Returns the handle so the caller
 * can unmount it early (a new fill unmounts every picker it mounted before).
 */
export function wireCandidatePicker(opts: WireCandidatePickerOpts): MountedCandidatePicker {
  const state: PickerState = { candidates: opts.candidates, pinnedId: opts.pinnedId };

  // Assigned immediately below; the handlers only ever run after the user opens
  // the picker, by which point `picker` is bound.
  let picker: MountedCandidatePicker;
  const handlers = createPickerHandlers({
    ...opts,
    state,
    refresh: (next) => picker.update(next),
    retire: () => {
      const i = opts.mounted.indexOf(picker);
      if (i >= 0) opts.mounted.splice(i, 1);
      picker.unmount();
    },
  });

  picker = mountCandidatePicker({
    target: opts.element,
    signature: opts.signature,
    candidates: state.candidates,
    pinnedId: state.pinnedId,
    currentCandidateId: opts.currentCandidateId,
    t: opts.t,
    locale: opts.locale,
    ...handlers,
  });
  opts.mounted.push(picker);
  return picker;
}
