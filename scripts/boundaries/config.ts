#!/usr/bin/env node

/**
 * Boundary Checker - 共有設定 & スキャンヘルパー
 *
 * monorepo 全体の import 境界を検査する 4 checker（feature-dag / package-layers /
 * public-api-barrels / import-paths）が共有する constant とスキャンユーティリティ。
 *
 * 検出は AST ではなく import specifier の正規表現抽出で行う（既存 boundary checker も
 * ESLint JSON 文字列 parse 方式）。対象は import / export-from / dynamic import の 3 形態。
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** repo root（scripts/boundaries/ から 2 つ上） */
export const ROOT = resolve(__dirname, '../..');

/** root に置く boundary budget（feature-dag / import-paths のラチェット値） */
export const BUDGET_FILE = resolve(ROOT, '.boundary-budget.json');

// =============================================================================
// workspace map（@dayopt/x → packages/x | apps/x）
// =============================================================================

export interface WorkspaceMap {
  /** package name（@dayopt/components）→ repo-relative root（packages/components） */
  nameToRoot: Map<string, string>;
}

/**
 * packages/* と apps/* の package.json を読んで name → root の対応を作る。
 * 新規 package を増やしても自動追従する（ハードコードしない）。
 */
export function buildWorkspaceMap(): WorkspaceMap {
  const nameToRoot = new Map<string, string>();
  for (const group of ['packages', 'apps']) {
    const groupDir = resolve(ROOT, group);
    if (!existsSync(groupDir)) continue;
    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pkgJson = resolve(groupDir, entry.name, 'package.json');
      if (!existsSync(pkgJson)) continue;
      try {
        const { name } = JSON.parse(readFileSync(pkgJson, 'utf8')) as { name?: string };
        if (typeof name === 'string' && name.length > 0) {
          nameToRoot.set(name, `${group}/${entry.name}`);
        }
      } catch {
        // package.json が壊れている場合はスキップ（boundary 検査の対象外）
      }
    }
  }
  return { nameToRoot };
}

// =============================================================================
// file 列挙（git ls-files = gitignore 準拠・build artifact 除外・依存ゼロ）
// =============================================================================

/**
 * working tree の .ts/.tsx を repo-relative path で返す。pathspec で範囲を絞る。
 * `--cached --others --exclude-standard` で追跡済み + 未追跡（gitignore 除外）の両方を見るため、
 * commit 前の新規ファイルも検査対象になる（eslint の working-tree 走査と挙動を揃える）。
 */
export function gitListSources(pathspecs: string[]): string[] {
  const args = pathspecs.map((p) => `'${p}'`).join(' ');
  const out = execSync(`git ls-files --cached --others --exclude-standard ${args}`, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const seen = new Set<string>();
  for (const line of out.split('\n')) {
    const rel = line.trim();
    if (rel.length === 0) continue;
    if (!rel.endsWith('.ts') && !rel.endsWith('.tsx')) continue;
    if (!existsSync(resolve(ROOT, rel))) continue; // index に残る削除済みファイルを除外
    seen.add(rel);
  }
  return [...seen];
}

// =============================================================================
// import specifier 抽出
// =============================================================================

/** コメント（block / line）を除去。コメント内の import 例（web barrel 等）の誤検出を防ぐ。 */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comment
    .replace(/(^|[^:])\/\/.*$/gm, '$1'); // line comment（:// の URL は温存）
}

// import x from 'spec' / export x from 'spec' / import 'spec' / import('spec')
// .from('table')（Supabase）等の誤検出を防ぐため直前が . や英数字でないことを要求。
const SPEC_RE = /(?<![.\w])(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

/** ソースから import / export-from / dynamic import の specifier を抽出。 */
export function extractImports(src: string): string[] {
  const cleaned = stripComments(src);
  const specs: string[] = [];
  let m: RegExpExecArray | null;
  SPEC_RE.lastIndex = 0;
  while ((m = SPEC_RE.exec(cleaned)) !== null) {
    specs.push(m[1]);
  }
  return specs;
}

// =============================================================================
// root 解決（file path / import specifier → 所属 workspace root）
// =============================================================================

/** repo-relative path から所属 root（packages/x | apps/x）を返す。該当なしは null。 */
export function ownerRootOf(relPath: string): string | null {
  const m = relPath.match(/^((?:packages|apps)\/[^/]+)\//);
  return m ? m[1] : null;
}

/**
 * import specifier を解決し、着地先 workspace root を返す。
 * - @dayopt/x（bare）→ workspace map
 * - 相対（./ ../）→ fromRelPath から解決して root 判定（package root 越境・apps 逆依存を検出）
 * - apps/ packages/ の literal path → そのまま root 判定
 * - 外部 npm / 解決不能 → null
 */
export function resolveSpecifierRoot(
  spec: string,
  fromRelPath: string,
  workspace: WorkspaceMap,
): string | null {
  // bare workspace package（@dayopt/components 等）。sub-path も先頭一致で吸収。
  for (const [name, root] of workspace.nameToRoot) {
    if (spec === name || spec.startsWith(`${name}/`)) return root;
  }
  // app alias（@/...）は app 専用。package 内で使われたら app 参照として扱う。
  if (spec === '@' || spec.startsWith('@/')) return '@alias';
  // 相対 import：fromRelPath の dir から解決して root 判定。
  if (spec.startsWith('.')) {
    const abs = resolve(dirname(resolve(ROOT, fromRelPath)), spec);
    const rel = relative(ROOT, abs);
    return ownerRootOf(rel.endsWith('/') ? rel : `${rel}/`);
  }
  // literal monorepo path（apps/product/... 等）。
  if (spec.startsWith('apps/') || spec.startsWith('packages/')) {
    return ownerRootOf(spec.endsWith('/') ? spec : `${spec}/`);
  }
  // 外部 npm（react, clsx, @radix-ui/* 等）。
  return null;
}

// =============================================================================
// public-api-barrels: forbid 対象の barrel path（存在 or export を禁止）
// =============================================================================

export const FORBIDDEN_BARRELS = [
  'apps/product/src/components/index.ts',
  'apps/product/src/components/ui/index.ts',
  'apps/web/src/components/index.ts',
  'apps/web/src/components/ui/index.ts',
];

// =============================================================================
// import-paths: deprecated import path 判定
// =============================================================================

/** 完全に廃止された import 接頭辞（存在自体を禁止）。 */
export const DEPRECATED_PREFIXES = [
  '@/lib/components/', // 旧 component 配置（dir 消滅済み）
  '@dayopt/ui', // 非 canonical な package 名（canonical = @dayopt/components）
];

/** app alias（@/）→ 各 app の src 実 path。`@/components/ui/x` の実ファイル存在判定に使う。 */
export function aliasBaseForApp(appRoot: string): string {
  return `${appRoot}/src`;
}

/** `@/components/ui/<name>` が app-local 実ファイルを持つか（.tsx / index.tsx / .ts）。 */
export function appLocalComponentExists(appRoot: string, subPath: string): boolean {
  const base = resolve(ROOT, aliasBaseForApp(appRoot), subPath);
  return (
    existsSync(`${base}.tsx`) ||
    existsSync(`${base}.ts`) ||
    existsSync(resolve(base, 'index.tsx')) ||
    existsSync(resolve(base, 'index.ts'))
  );
}
