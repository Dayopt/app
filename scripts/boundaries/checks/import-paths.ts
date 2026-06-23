#!/usr/bin/env node

/**
 * Check: Import Paths（migration 後に旧 import path が戻らないことを検知）
 *
 * ADR-011 の components migration 後、canonical import = @dayopt/components に統一する。
 * deprecated 判定:
 *  1. `@/lib/components/**`（旧配置・dir 消滅済み）/ `@dayopt/ui`（非 canonical 名）
 *  2. `@/components/ui/<name>` で app-local 実ファイル（<name>.tsx / <name>/index.tsx）が無いもの
 *     = migrated 済みなので @dayopt/components へ向けるべき残骸。実ファイルがある正規 app-local
 *       （avatar / toast / mini-calendar 等）は許可する。
 *
 * 総数をラチェット budget と比較する（vi.mock 等の非 import 参照は対象外）。
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  appLocalComponentExists,
  DEPRECATED_PREFIXES,
  extractImports,
  gitListSources,
  ownerRootOf,
  ROOT,
} from '../config.ts';

export interface ImportPathsResult {
  deprecated: number;
  violations: string[];
}

const COMPONENTS_UI_RE = /^@\/components\/ui\/(.+)$/;

function isDeprecatedPrefix(spec: string): boolean {
  return DEPRECATED_PREFIXES.some((prefix) => {
    const withSlash = prefix.endsWith('/') ? prefix : `${prefix}/`;
    return spec === prefix || spec.startsWith(withSlash);
  });
}

export function runImportPaths(): ImportPathsResult {
  const files = gitListSources([
    'apps/product/**/*.ts',
    'apps/product/**/*.tsx',
    'apps/web/**/*.ts',
    'apps/web/**/*.tsx',
  ]);

  const violations: string[] = [];
  for (const file of files) {
    const owner = ownerRootOf(file);
    if (owner === null || !owner.startsWith('apps/')) continue;

    const src = readFileSync(resolve(ROOT, file), 'utf8');
    for (const spec of extractImports(src)) {
      if (isDeprecatedPrefix(spec)) {
        violations.push(`${file}: 廃止 import path '${spec}'（canonical = @dayopt/components）`);
        continue;
      }
      const m = spec.match(COMPONENTS_UI_RE);
      if (m !== null && !appLocalComponentExists(owner, `components/ui/${m[1]}`)) {
        violations.push(
          `${file}: '${spec}' は app-local 実体なし（migrated 残骸）。@dayopt/components を使う`,
        );
      }
    }
  }

  return { deprecated: violations.length, violations };
}
