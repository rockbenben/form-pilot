/**
 * Merge `patch`'s keys onto `base`, deep-merging the `basic` key.
 *
 * Top-level resume keys shallow-replace, EXCEPT `basic`, which deep-merges its
 * own keys. `basic` is written by two independent paths — the debounced field
 * editor (partial scalar deltas) and out-of-band candidate mutations (phone /
 * email arrays + pinned ids). Deep-merging keeps a field-edit delta from
 * clobbering candidate arrays it never touched, and vice versa.
 *
 * This one rule is shared by every place that merges resume patches — the
 * optimistic render, the debounce coalescer, and the storage write — so they
 * cannot drift out of lockstep and silently reintroduce the clobber bug.
 */
export function mergeResumePatch<T extends object>(base: T, patch: Partial<T>): T {
  const merged = { ...base, ...patch };
  const baseBasic = (base as { basic?: object }).basic;
  const patchBasic = (patch as { basic?: object }).basic;
  if (baseBasic && patchBasic) {
    (merged as { basic?: object }).basic = { ...baseBasic, ...patchBasic };
  }
  return merged;
}
