import { describe, it, expect, beforeEach } from 'vitest';
import { scanFields } from '@/lib/engine/scanner';
import type { PlatformAdapter } from '@/lib/engine/adapters/types';

beforeEach(() => { document.body.innerHTML = ''; });

describe('scanFields', () => {
  it('returns one item per input/select/textarea', async () => {
    document.body.innerHTML = `
      <label for="n">姓名</label><input id="n" name="name" type="text">
      <label for="e">邮箱</label><input id="e" name="email" type="email">
      <label for="u">你的问题</label><input id="u" name="unknown" type="text">
    `;
    const items = await scanFields(document, null);
    expect(items).toHaveLength(3);
    const recognized = items.filter((i) => i.status === 'recognized');
    expect(recognized.map((i) => i.resumePath).sort()).toEqual(
      ['basic.email', 'basic.name'].sort(),
    );
    expect(items.filter((i) => i.status === 'unrecognized')).toHaveLength(1);
  });

  it('does NOT mutate element values', async () => {
    document.body.innerHTML = `<input id="n" name="name" value="pre">`;
    await scanFields(document, null);
    expect((document.getElementById('n') as HTMLInputElement).value).toBe('pre');
  });

  it('survives adapter.scan() throwing — falls back to heuristic', async () => {
    const buggyAdapter: PlatformAdapter = {
      id: 'buggy',
      matchUrl: /x/,
      version: '1.0.0',
      scan: () => { throw new Error('adapter boom'); },
      fill: async () => false,
    };
    document.body.innerHTML = `<label for="n">姓名</label><input id="n" name="name" type="text">`;
    const items = await scanFields(document, buggyAdapter);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('recognized');
    expect(items[0].resumePath).toBe('basic.name');
    expect(items[0].source).toBe('heuristic');
  });
});
