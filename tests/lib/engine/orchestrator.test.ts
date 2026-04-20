import { describe, it, expect, beforeEach } from 'vitest';
import { orchestrateFill } from '@/lib/engine/orchestrator';
import type { Resume } from '@/lib/storage/types';
import { createEmptyResume } from '@/lib/storage/types';
import { computeSignatureFor } from '@/lib/capture/signature';
import type { PageMemoryEntry } from '@/lib/capture/types';

function buildForm(fields: { label: string; name: string; type?: string }[]): HTMLFormElement {
  const form = document.createElement('form');
  for (const f of fields) {
    const div = document.createElement('div');
    div.innerHTML = `<label for="${f.name}">${f.label}</label><input id="${f.name}" name="${f.name}" type="${f.type ?? 'text'}">`;
    form.appendChild(div);
  }
  document.body.appendChild(form);
  return form;
}

describe('orchestrateFill', () => {
  const resume: Resume = {
    ...createEmptyResume('test', 'test'),
    basic: {
      ...createEmptyResume('', '').basic,
      name: '张三',
      email: 'z@test.com',
      phone: '13812345678',
    },
  };

  beforeEach(() => { document.body.innerHTML = ''; });

  it('fills recognized fields from resume data', async () => {
    const form = buildForm([
      { label: '姓名', name: 'name' },
      { label: '邮箱', name: 'email' },
    ]);
    const result = await orchestrateFill(document, resume, null);
    expect(result.filled).toBe(2);
    expect((form.querySelector('#name') as HTMLInputElement).value).toBe('张三');
    expect((form.querySelector('#email') as HTMLInputElement).value).toBe('z@test.com');
  });

  it('marks unrecognized fields', async () => {
    buildForm([{ label: '你最大的缺点是什么', name: 'weakness' }]);
    const result = await orchestrateFill(document, resume, null);
    expect(result.unrecognized).toBe(1);
    expect(result.items[0].status).toBe('unrecognized');
  });
});

describe('orchestrateFill with page memory', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('fills unrecognized fields from page memory as Phase 3', async () => {
    const resume: Resume = createEmptyResume('t', 't');
    document.body.innerHTML = `
      <label for="q">你最大的缺点</label>
      <input id="q" name="weakness" type="text">
    `;
    const q = document.getElementById('q')!;
    const entries: PageMemoryEntry[] = [
      { signature: computeSignatureFor(q), index: 0, kind: 'text', value: 'I overthink', updatedAt: 0 },
    ];
    const result = await orchestrateFill(document, resume, null, entries);
    expect((q as HTMLInputElement).value).toBe('I overthink');
    expect(result.items[0].source).toBe('memory');
    expect(result.items[0].status).toBe('filled');
    expect(result.items[0].confidence).toBe(1.0);
  });

  it('does not overwrite already-filled fields with memory', async () => {
    const resume: Resume = {
      ...createEmptyResume('t', 't'),
      basic: { ...createEmptyResume('', '').basic, name: '张三' },
    };
    document.body.innerHTML = `<label for="n">姓名</label><input id="n" name="name">`;
    const el = document.getElementById('n')!;
    const entries: PageMemoryEntry[] = [
      { signature: computeSignatureFor(el), index: 0, kind: 'text', value: '李四', updatedAt: 0 },
    ];
    const result = await orchestrateFill(document, resume, null, entries);
    expect((el as HTMLInputElement).value).toBe('张三');
    expect(result.items[0].source).toBe('heuristic');
  });

  it('does not overwrite draft-restored fields with memory (Phase 3 skip)', async () => {
    const resume: Resume = createEmptyResume('t', 't');
    document.body.innerHTML = `
      <label for="q">你最大的缺点</label>
      <input id="q" name="weakness" type="text" value="my draft answer">
    `;
    const q = document.getElementById('q') as HTMLInputElement;
    q.setAttribute('data-formpilot-restored', 'draft');
    const entries: PageMemoryEntry[] = [
      { signature: computeSignatureFor(q), index: 0, kind: 'text', value: 'memory answer', updatedAt: 0 },
    ];
    await orchestrateFill(document, resume, null, entries);
    expect(q.value).toBe('my draft answer');
  });
});
