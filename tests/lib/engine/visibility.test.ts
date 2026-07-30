import { describe, it, expect } from 'vitest';
import { resolveVisibility, RESUME_FIELD_THRESHOLD, type VisibilityInput } from '@/lib/engine/visibility';

function input(patch: Partial<VisibilityInput> = {}): VisibilityInput {
  return {
    override: undefined,
    triggerMode: 'auto',
    hasDraft: false,
    hasMemory: false,
    resumeFieldCount: 0,
    // Existing cases were written before the profile condition existed and are
    // all about page/settings precedence, so they assume a usable profile.
    profileHasData: true,
    ...patch,
  };
}

describe('resolveVisibility', () => {
  it('hides when the site override is never, even with a draft', () => {
    expect(resolveVisibility(input({ override: 'never', hasDraft: true }))).toBe(false);
  });

  it('hides when the site override is never, even in a field-rich page', () => {
    expect(resolveVisibility(input({ override: 'never', resumeFieldCount: 30 }))).toBe(false);
  });

  it('shows when the site override is always, even with nothing recognised', () => {
    expect(resolveVisibility(input({ override: 'always', resumeFieldCount: 0 }))).toBe(true);
  });

  it('shows when the site override is always, even in manual mode', () => {
    expect(resolveVisibility(input({ override: 'always', triggerMode: 'manual' }))).toBe(true);
  });

  it('hides in manual mode despite a high field count', () => {
    expect(resolveVisibility(input({ triggerMode: 'manual', resumeFieldCount: 30 }))).toBe(false);
  });

  it('hides in manual mode despite a draft', () => {
    expect(resolveVisibility(input({ triggerMode: 'manual', hasDraft: true }))).toBe(false);
  });

  it('shows in auto mode when a draft exists', () => {
    expect(resolveVisibility(input({ hasDraft: true }))).toBe(true);
  });

  it('shows in auto mode when page memory exists', () => {
    expect(resolveVisibility(input({ hasMemory: true }))).toBe(true);
  });

  it('shows at the threshold', () => {
    expect(resolveVisibility(input({ resumeFieldCount: RESUME_FIELD_THRESHOLD }))).toBe(true);
  });

  it('hides one below the threshold', () => {
    expect(resolveVisibility(input({ resumeFieldCount: RESUME_FIELD_THRESHOLD - 1 }))).toBe(false);
  });

  it('hides on a bare page', () => {
    expect(resolveVisibility(input())).toBe(false);
  });
});

describe('RESUME_FIELD_THRESHOLD', () => {
  it('is 5', () => {
    expect(RESUME_FIELD_THRESHOLD).toBe(5);
  });
});

describe('resolveVisibility · an empty profile', () => {
  // A fresh install used to put the toolbar on every form page, where its one
  // action produced nothing.
  it('stays hidden while the profile holds nothing', () => {
    expect(resolveVisibility(input({ profileHasData: false, resumeFieldCount: 20 }))).toBe(false);
  });

  it('appears as soon as the profile holds something', () => {
    expect(resolveVisibility(input({ profileHasData: true, resumeFieldCount: 20 }))).toBe(true);
  });

  // A draft is the user's own unfinished application. Restoring it needs no
  // profile, so it must still bring the toolbar back.
  it('still comes back for a saved draft on an empty profile', () => {
    expect(resolveVisibility(input({ profileHasData: false, hasDraft: true, resumeFieldCount: 0 }))).toBe(true);
    expect(resolveVisibility(input({ profileHasData: false, hasMemory: true, resumeFieldCount: 0 }))).toBe(true);
  });

  it('still obeys an explicit always override on an empty profile', () => {
    expect(resolveVisibility(input({ profileHasData: false, override: 'always' }))).toBe(true);
  });

  it('never overrides a never rule or manual mode', () => {
    expect(resolveVisibility(input({ profileHasData: true, override: 'never', resumeFieldCount: 20 }))).toBe(false);
    expect(resolveVisibility(input({ profileHasData: true, triggerMode: 'manual', resumeFieldCount: 20 }))).toBe(false);
  });
});
