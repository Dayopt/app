import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { globSync } from 'glob';
import { describe, expect, it } from 'vitest';

/**
 * infra.md の「API Endpoints Overview」表と実装 route の双方向照合（#1981）。
 *
 * PR #1976 で phantom 2 件（削除済み route の残存、うち 1 件は 5 か月放置）と
 * undocumented 6 件が同時に見つかった。表ヘッダの「最終照合」日付は人手の照合に
 * 依存しており機能しなかった。route の追加・削除・infra.md 側の記述漏れのいずれでも
 * 必ず fail する形にする（route-duration-contract.test.ts と同じ allowlist の思想）。
 *
 * 「allowlist」はこの test 内に別途複製せず、infra.md の表そのものをパースして使う。
 * 複製すると allowlist と infra.md がそれぞれ独立に古くなり得て、照合の意味が無くなる。
 */

const ROOT_DIR = resolve(import.meta.dirname, '../..');
const INFRA_MD_PATH = resolve(ROOT_DIR, 'docs/engineering/infra.md');

/**
 * infra.md の Path 表記 → 実装 route の directory への変換で、単純な文字列置換
 * （`/api/foo/bar` → `src/app/api/foo/bar`）では表せない例外だけをここに書く。
 * ここに無い path は機械的に変換できる前提で扱う（変換できない新しい表記が出たら、
 * この override を足すか記法を見直すこと）。
 *
 * `route.ts` / `route.tsx` の拡張子差（`/api/og` は `.tsx`）は比較対象に含めない —
 * 同一 directory に両方が同時に存在することは無く、glob 側が実在する拡張子を保証する。
 */
const PATH_OVERRIDES: Record<string, string> = {
  '/api/v1/system/*': 'src/app/api/v1/system/[...retired]',
};

function documentedPathToRouteDir(path: string): string {
  if (path in PATH_OVERRIDES) return PATH_OVERRIDES[path];
  return `src/app${path}`;
}

function routeFileToDir(routeFile: string): string {
  return routeFile.replace(/\/route\.tsx?$/, '');
}

/** infra.md の「### 一覧」表を { app, path } の行へパースする。 */
function parseDocumentedRoutes(): Array<{ app: string; path: string }> {
  const infraMd = readFileSync(INFRA_MD_PATH, 'utf8');
  const afterHeading = infraMd.split('\n### 一覧\n')[1];
  const tableSection = afterHeading?.split('\n### 共通方針\n')[0];

  if (!tableSection) {
    throw new Error(
      'infra.md の「### 一覧」〜「### 共通方針」区間が見つからなかった。見出しを変更したなら、この test のパース対象も直すこと',
    );
  }

  return tableSection
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => line.split('|').map((cell) => cell.trim()))
    .filter((cells) => cells[1] === 'Product' || cells[1] === 'Web') // ヘッダ行・区切り行を除外
    .map((cells) => ({ app: cells[1] as string, path: (cells[2] ?? '').replaceAll('`', '') }));
}

const APPS = [
  { app: 'Product', dir: resolve(ROOT_DIR, 'apps/product') },
  { app: 'Web', dir: resolve(ROOT_DIR, 'apps/web') },
] as const;

describe('infra.md API endpoint 一覧と実装 route の双方向照合', () => {
  const documentedRoutes = parseDocumentedRoutes();

  it('infra.md の表から Product / Web 両方の行を読めている', () => {
    // パース自体が壊れて 0 件になった場合、以降の it が両方 missing=[] で
    // グリーンになりうる（何も比較していないため）。パースの生存確認を切り離す。
    expect(documentedRoutes.filter((r) => r.app === 'Product').length).toBeGreaterThan(0);
    expect(documentedRoutes.filter((r) => r.app === 'Web').length).toBeGreaterThan(0);
  });

  describe.each(APPS)('$app', ({ app, dir }) => {
    it('infra.md の一覧と実装 route が完全一致する', () => {
      const documentedRouteDirs = documentedRoutes
        .filter((r) => r.app === app)
        .map((r) => documentedPathToRouteDir(r.path))
        .sort();

      // dot: true が無いと .well-known 配下を取りこぼす
      // （route-duration-contract.test.ts の教訓。ここでは /api 配下のみ対象なので
      // 現状 dot 付きディレクトリは無いが、将来の追加を黙って取りこぼさないため付ける）
      const discoveredRouteDirs = globSync('src/app/api/**/route.{ts,tsx}', {
        cwd: dir,
        dot: true,
      })
        .map(routeFileToDir)
        .sort();

      const missing = discoveredRouteDirs.filter((route) => !documentedRouteDirs.includes(route));
      const stale = documentedRouteDirs.filter((route) => !discoveredRouteDirs.includes(route));

      expect(
        { missing, stale },
        `${app}: infra.md の「API Endpoints Overview」§一覧 を実装 route に合わせて更新すること（missing = 未文書化の route、stale = 削除済みなのに表に残存）`,
      ).toEqual({ missing: [], stale: [] });

      // missing/stale が空でも、同じ path を重複記載していれば総数だけがずれる。
      // 個別 path の一致に加えて総数一致も見ることで、この種の記載漏れも fail closed にする。
      expect(
        documentedRouteDirs.length,
        `${app}: infra.md の表の行数（${documentedRouteDirs.length}）が実装 route 数（${discoveredRouteDirs.length}）と一致しない`,
      ).toBe(discoveredRouteDirs.length);
    });
  });
});
