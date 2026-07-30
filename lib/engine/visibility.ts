/**
 * Number of distinct resume paths a page must expose before the toolbar
 * appears on its own. See docs/superpowers/specs/2026-07-29-trigger-visibility-design.md
 * for the calibration table.
 */
export const RESUME_FIELD_THRESHOLD = 5;

export interface VisibilityInput {
  /** Per-site override for this hostname, if any. */
  override: 'always' | 'never' | undefined;
  triggerMode: 'auto' | 'manual';
  hasDraft: boolean;
  hasMemory: boolean;
  /** Result of probeResumeFields() for this page. */
  resumeFieldCount: number;
  /**
   * Does the active profile hold anything at all? False on a fresh install and
   * for a profile the user created but never filled.
   */
  profileHasData: boolean;
}

/**
 * Decide whether the floating toolbar should mount itself.
 *
 * Precedence, highest first:
 *   1. site override 'never'  → hide
 *   2. site override 'always' → show
 *   3. manual trigger mode    → hide (the user summons it instead)
 *   4. a draft or page memory exists for this URL → show
 *   5. the profile is empty   → hide
 *   6. the page probes at or above the threshold  → show
 *   7. otherwise → hide
 *
 * Step 5 sits BELOW the draft check on purpose. A saved draft is the user's own
 * unfinished application and restoring it needs no profile at all, so it must
 * still bring the toolbar back on a profile that is empty.
 *
 * Without step 5, a fresh install put the toolbar on every form page and its
 * one action produced nothing — the product advertising a capability it could
 * not yet deliver, on a page the user was trying to work on. An explicit
 * site override still wins, so 'always' works before the profile is filled.
 *
 * NOTE: this does NOT govern the draft badge. The badge shows whenever a draft
 * exists and the override is not 'never' — a draft is the user's own unfinished
 * application coming back to find them, not the product advertising itself, and
 * it expires after 30 days.
 */
export function resolveVisibility(input: VisibilityInput): boolean {
  if (input.override === 'never') return false;
  if (input.override === 'always') return true;
  if (input.triggerMode === 'manual') return false;
  if (input.hasDraft || input.hasMemory) return true;
  if (!input.profileHasData) return false;
  return input.resumeFieldCount >= RESUME_FIELD_THRESHOLD;
}
