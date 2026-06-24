#!/usr/bin/env node

/**
 * Check: Public API / Barrel（app-local barrel の禁止）
 *
 * 意図的な public API barrel（packages の src 配下 index.ts、各 feature の index.ts）は許可し、
 * 広域な app-local barrel（components/index.ts 等）を禁止する。ADR-011 の「app barrel 不使用」
 * を固定する architectural invariant。budget を持たず hard-fail。
 *
 * 判定: FORBIDDEN_BARRELS の各 path が「存在しない」または「export を持たない」なら OK。
 * export を持つ barrel ファイルが存在したら違反。
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { FORBIDDEN_BARRELS, ROOT, stripComments } from '../config.ts';

export interface BarrelsResult {
  violations: string[];
}

export function runPublicApiBarrels(): BarrelsResult {
  const violations: string[] = [];

  for (const rel of FORBIDDEN_BARRELS) {
    const abs = resolve(ROOT, rel);
    if (!existsSync(abs)) continue; // 不在 = 準拠

    const src = stripComments(readFileSync(abs, 'utf8'));
    if (/\bexport\b/.test(src)) {
      violations.push(
        `${rel}: 広域 app-local barrel が export を持つ。直接 import か @dayopt/components を使う`,
      );
    }
  }

  return { violations };
}
