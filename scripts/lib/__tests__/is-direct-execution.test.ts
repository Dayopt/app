import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { isDirectExecution } from '../is-direct-execution.mjs';

// #2432 plan-review 指摘（plan-critic）: `import.meta.url` は静的にモジュール
// ごとに束縛されるため、共有 helper の内部でこれを参照すると常に helper 自身の
// URL になり判定が壊れる。呼び出し元が渡す設計であることを固定する。
describe('isDirectExecution', () => {
  it('process.argv[1] の実 path が渡された moduleUrl と一致すれば true', () => {
    const selfPath = process.argv[1] ?? __filename;
    vi.spyOn(process, 'argv', 'get').mockReturnValue([process.execPath, selfPath]);
    const url = pathToFileURL(realpathSync(selfPath)).href;
    expect(isDirectExecution(url)).toBe(true);
    vi.restoreAllMocks();
  });

  it('別のファイルの moduleUrl を渡せば false（import されただけの場合を想定）', () => {
    expect(isDirectExecution('file:///not/the/entrypoint.mjs')).toBe(false);
  });

  it('process.argv[1] が無い場合は false', () => {
    vi.spyOn(process, 'argv', 'get').mockReturnValue([process.execPath]);
    expect(isDirectExecution('file:///anything.mjs')).toBe(false);
    vi.restoreAllMocks();
  });

  it('process.argv[1] が存在しないpathでも例外を投げず false を返す', () => {
    vi.spyOn(process, 'argv', 'get').mockReturnValue([
      process.execPath,
      '/nonexistent/path/to/nowhere.mjs',
    ]);
    expect(isDirectExecution('file:///anything.mjs')).toBe(false);
    vi.restoreAllMocks();
  });
});
