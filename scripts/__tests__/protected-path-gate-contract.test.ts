/**
 * `PROTECTED_PATH_GLOBS`（`scripts/ci/protected-path-gate.mjs`）の drift 検出（#2503）。
 *
 * このリストは「触れたら内製クロスレビュー + Codex の 2 系統が必須になる」という
 * 強い意味を持つが、リテラルとして書かれているため次の 2 種類の drift が
 * 機械には見えない:
 *   1. リネーム / ディレクトリ移動で glob が指す先が消え、gate が黙って
 *      「マッチしない = 保護されない」へ縮退する
 *   2. `.github/workflows/production-config-audit.yml` の self-change 検出
 *      （grep 正規表現）と、ここに載せた同じ 4 path のコピーが片方だけ変わる
 *
 * ここでは (1) を existsSync で、(2) を workflow の grep 正規表現を実際に
 * パースして `PRODUCTION_CONFIG_AUDIT_CONTRACT_PATHS` と突き合わせることで固定する。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_CONFIG_AUDIT_CONTRACT_PATHS,
  PROTECTED_PATH_GLOBS,
} from '../ci/protected-path-gate.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** glob の中で最初に `*` が現れる位置より前の、確実に存在するはずのディレクトリ部分。 */
function staticDirectoryFor(glob: string): string {
  const starIndex = glob.indexOf('*');
  const prefix = starIndex === -1 ? glob : glob.slice(0, starIndex);
  return prefix.endsWith('/') ? prefix.slice(0, -1) : dirname(prefix);
}

describe('PROTECTED_PATH_GLOBS の drift 検出（#2503）', () => {
  it('glob を含まないリテラルは実ファイル/ディレクトリとして存在する', () => {
    const literals = PROTECTED_PATH_GLOBS.filter((glob) => !glob.includes('*'));
    // 判定そのものが空リストで無意味化していないことを保証する。
    expect(literals.length).toBeGreaterThan(0);

    const missing = literals.filter((literal) => !existsSync(join(rootDir, literal)));
    expect(missing).toEqual([]);
  });

  it('glob の static prefix（最初の * より前のディレクトリ）は実在する', () => {
    const globs = PROTECTED_PATH_GLOBS.filter((glob) => glob.includes('*'));
    expect(globs.length).toBeGreaterThan(0);

    const missing = globs
      .map((glob) => ({ glob, dir: staticDirectoryFor(glob) }))
      .filter(({ dir }) => !existsSync(join(rootDir, dir)));
    expect(missing).toEqual([]);
  });

  it('production-config-audit.yml の self-change grep と PRODUCTION_CONFIG_AUDIT_CONTRACT_PATHS は同じ 4 path を指す', () => {
    const workflow = readFileSync(
      join(rootDir, '.github/workflows/production-config-audit.yml'),
      'utf8',
    );

    // 対象の grep 行を取り出す: grep -Eq '^(path1|path2|...)$'
    const grepLineMatch = workflow.match(/grep -Eq '\^\(([^)]+)\)\$'/);
    expect(grepLineMatch).not.toBeNull();

    const alternation = grepLineMatch![1];
    // 各 alternative は shell 経由で ERE リテラルとして書かれており、正規表現の
    // メタ文字（`.`）だけがエスケープされている（`\.` -> `.`）。それ以外の
    // エスケープは想定していないため、他の文字が来たら気づけるよう安全側で
    // 単純な `\X -> X` の unescape に留める。
    const paths = alternation.split('|').map((segment) => segment.replace(/\\(.)/g, '$1'));

    expect(new Set(paths)).toEqual(new Set(PRODUCTION_CONFIG_AUDIT_CONTRACT_PATHS));
    // 重複や空文字列が紛れて Set 比較をすり抜けていないことも確認する。
    expect(paths.length).toBe(PRODUCTION_CONFIG_AUDIT_CONTRACT_PATHS.length);
  });

  it('PRODUCTION_CONFIG_AUDIT_CONTRACT_PATHS は PROTECTED_PATH_GLOBS に含まれる', () => {
    for (const path of PRODUCTION_CONFIG_AUDIT_CONTRACT_PATHS) {
      expect(PROTECTED_PATH_GLOBS).toContain(path);
    }
  });
});
