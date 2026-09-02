import { describe, expect, it, vi } from 'vitest';

import { GH_MAX_BUFFER_BYTES, REPO, runGh, runGhJson } from './gh.mjs';

describe('runGh / runGhJson', () => {
  it('gh を argv 配列で呼び、shell を経由しない（maxBuffer は 32MB）', () => {
    const execFileImpl = vi.fn(() => '{"ok":true}');
    const out = runGh(['pr', 'list', '--repo', REPO], { execFileImpl });
    expect(out).toBe('{"ok":true}');
    expect(execFileImpl).toHaveBeenCalledWith('gh', ['pr', 'list', '--repo', REPO], {
      encoding: 'utf8',
      maxBuffer: GH_MAX_BUFFER_BYTES,
    });
  });

  it('runGhJson は stdout を JSON.parse して返す', () => {
    const execFileImpl = vi.fn(() => '[{"number":1}]');
    expect(runGhJson(['issue', 'list'], { execFileImpl })).toEqual([{ number: 1 }]);
  });

  it('危険な文字を含む引数もそのまま argv に載る（再解釈されない）', () => {
    const execFileImpl = vi.fn((_file: string, _args: string[]) => '{}');
    const evil = '`rm -rf /`; $(echo x) > /dev/null';
    runGhJson(['issue', 'create', '--title', evil], { execFileImpl });
    expect(execFileImpl).toHaveBeenCalledWith('gh', ['issue', 'create', '--title', evil], {
      encoding: 'utf8',
      maxBuffer: GH_MAX_BUFFER_BYTES,
    });
  });
});
