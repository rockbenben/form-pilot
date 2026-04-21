import { describe, it, expect } from 'vitest';
import {
  createResume, getResume, listResumes, updateResume, deleteResume, renameResume,
  getActiveResumeId, setActiveResumeId,
} from '@/lib/storage/resume-store';

describe('resume-store', () => {
  it('creates a new resume with generated id and timestamps', async () => {
    const resume = await createResume('前端开发');
    expect(resume.meta.id).toBeTruthy();
    expect(resume.meta.name).toBe('前端开发');
    expect(resume.meta.createdAt).toBeGreaterThan(0);
    expect(resume.meta.updatedAt).toBe(resume.meta.createdAt);
    expect(resume.basic.name).toBe('');
    expect(resume.education).toEqual([]);
  });

  it('lists all resumes', async () => {
    await createResume('前端');
    await createResume('后端');
    const list = await listResumes();
    expect(list).toHaveLength(2);
    expect(list.map((r) => r.meta.name)).toContain('前端');
    expect(list.map((r) => r.meta.name)).toContain('后端');
  });

  it('gets a resume by id', async () => {
    const created = await createResume('设计师');
    const found = await getResume(created.meta.id);
    expect(found).not.toBeNull();
    expect(found!.meta.name).toBe('设计师');
  });

  it('returns null for unknown id', async () => {
    const found = await getResume('nonexistent');
    expect(found).toBeNull();
  });

  it('updates resume fields and bumps updatedAt', async () => {
    const created = await createResume('test');
    const updated = await updateResume(created.meta.id, {
      basic: { ...created.basic, name: '张三', email: 'z@test.com' },
    });
    expect(updated.basic.name).toBe('张三');
    expect(updated.basic.email).toBe('z@test.com');
    expect(updated.meta.updatedAt).toBeGreaterThanOrEqual(created.meta.updatedAt);
  });

  it('deletes a resume', async () => {
    const created = await createResume('to-delete');
    await deleteResume(created.meta.id);
    const found = await getResume(created.meta.id);
    expect(found).toBeNull();
  });

  it('tracks active resume id', async () => {
    const r1 = await createResume('r1');
    const r2 = await createResume('r2');
    await setActiveResumeId(r1.meta.id);
    expect(await getActiveResumeId()).toBe(r1.meta.id);
    await setActiveResumeId(r2.meta.id);
    expect(await getActiveResumeId()).toBe(r2.meta.id);
  });

  it('renames a resume and bumps updatedAt', async () => {
    const created = await createResume('旧名字');
    await new Promise((r) => setTimeout(r, 5));
    const renamed = await renameResume(created.meta.id, '新名字');
    expect(renamed.meta.name).toBe('新名字');
    expect(renamed.meta.updatedAt).toBeGreaterThan(created.meta.updatedAt);
    // Other fields untouched
    expect(renamed.basic).toEqual(created.basic);
  });

  it('rename trims whitespace', async () => {
    const created = await createResume('x');
    const renamed = await renameResume(created.meta.id, '  My Profile  ');
    expect(renamed.meta.name).toBe('My Profile');
  });

  it('rename rejects empty/whitespace names', async () => {
    const created = await createResume('x');
    await expect(renameResume(created.meta.id, '   ')).rejects.toThrow();
    await expect(renameResume(created.meta.id, '')).rejects.toThrow();
  });

  it('rename throws when id not found', async () => {
    await expect(renameResume('nope', 'x')).rejects.toThrow();
  });
});
