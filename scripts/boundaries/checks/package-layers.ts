#!/usr/bin/env node

/**
 * Check: Package Layers（packages ↔ apps の依存方向）
 *
 * ADR-011 の依存方向を固定する architectural invariant。budget を持たず hard-fail。
 *
 * 許可:  apps/* -> packages/*、packages/components -> packages/foundations|assets
 * 禁止:  packages/* -> apps/*（逆依存）、packages/* の @/ alias 使用、
 *        packages/foundations -> packages/components（layer 逆転）
 *
 * bare specifier（@dayopt/x）に加え relative import も resolve し、`../../apps/...` 形の
 * package root 越境・逆依存も検出する。
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  buildWorkspaceMap,
  extractImports,
  gitListSources,
  ownerRootOf,
  resolveSpecifierRoot,
  ROOT,
} from '../config.ts';

export interface PackageLayersResult {
  violations: string[];
}

/** owner root → target root の 1 edge を判定。違反なら理由文、OK なら null。 */
function checkEdge(owner: string, target: string, spec: string): string | null {
  if (owner === target) return null; // intra-root（自 package 内 relative）

  if (owner.startsWith('packages/')) {
    if (target === '@alias') {
      return `package が app 専用 alias '@/' を参照（'${spec}'）。packages は app に依存不可`;
    }
    if (target.startsWith('apps/')) {
      return `package -> ${target} の逆依存。packages は apps に依存不可`;
    }
    if (owner === 'packages/foundations' && target === 'packages/components') {
      return 'foundations -> components の layer 逆転。foundations は components を知らない';
    }
    return null; // packages -> packages（components -> foundations|assets 等）は許可
  }

  // apps/* → packages/* は許可。apps 内部の feature 境界は feature-dag checker の領域。
  return null;
}

export function runPackageLayers(): PackageLayersResult {
  const workspace = buildWorkspaceMap();
  const files = gitListSources([
    'packages/**/*.ts',
    'packages/**/*.tsx',
    'apps/**/*.ts',
    'apps/**/*.tsx',
  ]);

  const violations: string[] = [];
  for (const file of files) {
    const owner = ownerRootOf(file);
    if (owner === null) continue;
    // app 側は package-layers では起点にしない（逆依存の起点は packages のみ）。
    if (!owner.startsWith('packages/')) continue;

    const src = readFileSync(resolve(ROOT, file), 'utf8');
    for (const spec of extractImports(src)) {
      const target = resolveSpecifierRoot(spec, file, workspace);
      if (target === null) continue; // 外部 npm / 解決不能
      const reason = checkEdge(owner, target, spec);
      if (reason !== null) violations.push(`${file}: ${reason}`);
    }
  }

  return { violations };
}
