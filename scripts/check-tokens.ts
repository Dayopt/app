#!/usr/bin/env node

/**
 * Tailwind トークン違反チェッカー（repo 横断）
 *
 * トークン化すべき任意値・規約外の値を検出し、修正を促す。
 * pnpm lint:tokens で実行。
 *
 * このファイルは grep 実行（候補ファイルの発見）と結果表示だけの薄い CLI。
 * パターン定義と行単位の違反判定（excludePattern / lint-tokens-allow マーカー）は
 * check-tokens-core.ts の pure function が正で、そちらを test が直接叩く
 * （scripts/__tests__/check-tokens.test.ts）。
 *
 * 走査対象は SCAN_TARGETS、除外は EXCLUDE_PATHS（いずれも core 側で定義）。
 * 以前は apps/product の tsx だけだったため、apps/web と packages/components が
 * 未統治のまま規約外の値を溜めていた（motion / spacing の監査で 2 回続けて
 * 同じ穴に当たった）。
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import {
  ALLOW_MARKER,
  FORBIDDEN_PATTERNS,
  SCAN_TARGETS,
  findRuleViolations,
  isExcludedPath,
} from './check-tokens-core';

let hasViolations = false;
let hasWarnings = false;

/**
 * grep をシェルを介さず実行し、マッチ行を "path:line:content" で返す。
 *
 * exit code の扱いがこのスクリプトの要。grep は 0=ヒット / 1=ヒットなし /
 * 2=エラー（不正な正規表現、対象ディレクトリ不在など）を返す。以前は
 * `2>/dev/null || true` で 2 を 0 に化かしていたため、ERE が解釈できない
 * パターン（lookahead / lookbehind を含むもの）が即死しても「違反ゼロ」として
 * 静かに通り、4 ルールが導入以来一度も発火していなかった。
 * ここでは 2 を握り潰さず throw して、壊れたルールを気づける形にする。
 */
function grepLines(pattern: string): string[] {
  const res = spawnSync(
    'grep',
    ['-rEn', pattern, '--include=*.tsx', '--include=*.ts', ...SCAN_TARGETS],
    { encoding: 'utf8' },
  );

  if (res.error) throw res.error;
  if (res.status === 2) {
    throw new Error(
      `grep がパターンを解釈できませんでした（ERE では lookahead / lookbehind を使えない）\n` +
        `  pattern: ${pattern}\n  stderr: ${(res.stderr || '').trim()}`,
    );
  }

  return (res.stdout || '')
    .split('\n')
    .filter(Boolean)
    .filter((line) => !isExcludedPath(line));
}

/** ファイル内容のキャッシュ。マーカー直前行の判定や共起の窓を取るために元ファイルを読む */
const fileLines = new Map<string, string[]>();
function readLines(path: string): string[] {
  if (!fileLines.has(path)) fileLines.set(path, readFileSync(path, 'utf8').split('\n'));
  return fileLines.get(path) ?? [];
}

console.log('🔍 Tailwind トークン違反をチェック中...\n');

for (const rule of FORBIDDEN_PATTERNS) {
  // grep は「どのファイルに候補があるか」だけに使い、行の採否は core が決める
  const candidateFiles = [...new Set(grepLines(rule.pattern).map((line) => line.split(':')[0]))];

  const violations = candidateFiles.flatMap((path) =>
    findRuleViolations(rule, readLines(path)).map((lineNum) => ({ path, lineNum })),
  );

  if (violations.length === 0) continue;

  const files = [...new Set(violations.map((v) => v.path))];

  if (rule.warnOnly) {
    hasWarnings = true;
    console.log(`⚠️  [warn] ${rule.message}`);
  } else {
    hasViolations = true;
    console.log(`❌ ${rule.message}`);
  }
  console.log(`   修正例: ${rule.suggestion}`);
  console.log(`   該当ファイル（${violations.length} 箇所 / ${files.length} ファイル）:`);
  files.forEach((file) => {
    console.log(`     - ${file}`);
  });
  console.log('');
}

// ─── 共起チェック: bg-card には shadow が必要（Elevation ルール） ───
//
// className は複数行に分かれることがあるので、同一行だけを見ると誤検出する
// （bg-card が 1 行目、shadow-card が 2 行目、というケースが実際にあった）。
// 前後 2 行の窓で shadow を探す。
{
  const violations: string[] = [];

  for (const line of grepLines('bg-card')) {
    // 除外: stories, shadcn/ui プリミティブ, opacity 派生 (bg-card/)
    if (line.includes('.stories.') || line.includes('components/ui/') || /bg-card\//.test(line)) {
      continue;
    }

    // tint トークンのフォールバック（`colorClasses?.tint ?? 'bg-card'`）は
    // カレンダー lane 内の面で elevation の対象ではない
    if (/\?\?\s*'bg-card'/.test(line)) continue;

    // FieldSeparator のラベル背景。区切り線を切り抜くためのもので面ではない
    if (/data-\[slot=field-separator/.test(line)) continue;

    const [path, lineNum] = line.split(':');
    const all = readLines(path);
    const idx = Number(lineNum) - 1;
    const window = all.slice(Math.max(0, idx - 2), idx + 3).join('\n');

    // shadow-xs / shadow-sm / shadow-card が前後 2 行以内にあれば OK
    if (/shadow-(xs|sm|card)/.test(window)) continue;

    // 個別の例外は現場に `elevation-exempt` コメントを置いて理由を書く。
    // lint の設定に溜め込むより、なぜ例外なのかが読む人の目の前にある方がよい。
    // 意図して書く注記なので、shadow の窓より広く（同じ JSX 要素の頭に置ける）取る
    const exemptWindow = all.slice(Math.max(0, idx - 5), idx + 3).join('\n');
    if (/elevation-exempt/.test(exemptWindow)) continue;

    violations.push(line);
  }

  if (violations.length > 0) {
    // 全件解消したので error へ昇格した（2026-07-31）。個別の例外は
    // 現場の `elevation-exempt` コメントで外す
    hasViolations = true;
    console.log('❌ bg-card に shadow がない（Elevation ルール違反）');
    console.log('   修正例: bg-card は shadow-sm (Raised) / shadow-card (Overlay) と併用');
    console.log(`   該当箇所（${violations.length} 件）:`);
    for (const v of violations) {
      // "path:line:content" → 見やすく整形
      const [loc, lineNum, ...rest] = v.split(':');
      console.log(`     - ${loc}:${lineNum}: ${rest.join(':').trim().slice(0, 80)}`);
    }
    console.log('');
  }
}

// ─── 共起チェック: bg-card と素の border-border の併用（Elevation の border 表記） ───
//
// Elevation の面（bg-card）の輪郭線は border-border-subtle が正で、
// 素の border-border（後続に `-` が続かない形）との共起は濃い輪郭の名残り。
// shadow 共起チェックと同じ ±2 行の窓方式・同じ行単位の除外規則で検出する。
// border を持たない bg-card は対象外。
// 面ではない共起（ドラッグ枠、Button outline 系のボタン風要素）は現場の
// ALLOW_MARKER コメントで理由付きで外す。全 16 件を解消して error へ昇格（2026-07-31）。
{
  const violations: string[] = [];
  // 素の border-border のみ。border-border-subtle 等の派生トークンは正当
  const bareBorderBorder = /border-border($|[^a-zA-Z0-9-])/;

  for (const line of grepLines('bg-card')) {
    // 除外: stories, shadcn/ui プリミティブ, opacity 派生 (bg-card/)
    if (line.includes('.stories.') || line.includes('components/ui/') || /bg-card\//.test(line)) {
      continue;
    }

    // tint トークンのフォールバック（`colorClasses?.tint ?? 'bg-card'`）は
    // カレンダー lane 内の面で elevation の対象ではない
    if (/\?\?\s*'bg-card'/.test(line)) continue;

    // FieldSeparator のラベル背景。区切り線を切り抜くためのもので面ではない
    if (/data-\[slot=field-separator/.test(line)) continue;

    const [path, lineNum] = line.split(':');
    const all = readLines(path);
    const idx = Number(lineNum) - 1;
    const window = all.slice(Math.max(0, idx - 2), idx + 3).join('\n');

    if (!bareBorderBorder.test(window)) continue;

    // 意図して書く注記なので、shadow 共起の elevation-exempt と同じ広さの窓で見る
    const allowWindow = all.slice(Math.max(0, idx - 5), idx + 3).join('\n');
    if (allowWindow.includes(ALLOW_MARKER)) continue;

    violations.push(line);
  }

  if (violations.length > 0) {
    hasViolations = true;
    console.log('❌ bg-card に素の border-border が併用されている（Elevation ルール違反）');
    console.log('   修正例: bg-card の輪郭線は border-border-subtle を使用');
    console.log(`   該当箇所（${violations.length} 件）:`);
    for (const v of violations) {
      const [loc, lineNum, ...rest] = v.split(':');
      console.log(`     - ${loc}:${lineNum}: ${rest.join(':').trim().slice(0, 80)}`);
    }
    console.log('');
  }
}

if (hasViolations) {
  console.log('⚠️  トークン違反が見つかりました。修正してください。');
  process.exit(1);
} else if (hasWarnings) {
  console.log('✅ エラーなし（⚠️ 警告あり — 段階的に修正してください）');
  process.exit(0);
} else {
  console.log('✅ トークン違反なし');
  process.exit(0);
}
