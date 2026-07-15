/**
 * Coalesce a new resume patch into any patch still pending for the same resume.
 *
 * The dashboard debounces field edits: each edit stashes a patch and resets a
 * 500ms timer; only when the timer fires is the patch written to storage. If a
 * second edit lands within that window, its patch must be MERGED with the
 * pending one — replacing it would silently drop the earlier section's edit
 * (only the last top-level key would ever reach storage). Top-level keys are
 * distinct per section (basic / education / work / …), so a shallow merge across
 * keys is right.
 *
 * `basic` is the exception: its field editor emits partial scalar deltas (the
 * phone/email candidate arrays are owned by the out-of-band mutation path), so
 * two `basic` edits in the same window must DEEP-merge — a shallow replace would
 * drop the earlier field's edit. That deep-merge rule lives in the shared
 * {@link mergeResumePatch} helper used here, in the optimistic render, and in
 * the storage write.
 */
import { mergeResumePatch } from '@/lib/storage/merge-resume-patch';

export interface PendingPatch<P> {
  id: string;
  patch: P;
}

export function coalescePendingPatch<P extends object>(
  prev: PendingPatch<P> | null,
  id: string,
  patch: P,
): PendingPatch<P> {
  if (prev && prev.id === id) {
    return { id, patch: mergeResumePatch(prev.patch, patch) };
  }
  return { id, patch };
}
