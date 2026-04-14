import { describe, it, expect, beforeEach } from 'vitest';
import { orchestrateFill } from '@/lib/engine/orchestrator';
import type { Resume } from '@/lib/storage/types';
import { createEmptyResume } from '@/lib/storage/types';

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
