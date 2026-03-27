#!/usr/bin/env node

/**
 * Tailwind トークン違反チェッカー
 *
 * トークン化すべき任意値を検出し、修正を促す。
 * npm run lint:tokens で実行。
 */

import { execSync } from 'node:child_process';

interface ForbiddenPattern {
  pattern: string;
  message: string;
  suggestion: string;
  /** true = 検出するが CI を block しない（段階移行中のルール） */
  warnOnly?: boolean;
}

// 禁止パターン（トークン化すべき任意値）
const FORBIDDEN_PATTERNS: ForbiddenPattern[] = [
  {
    pattern: 'text-\\[[0-9]+px\\]',
    message: 'フォントサイズはトークンを使用 (text-xs, text-sm 等)',
    suggestion: 'text-[10px] → text-xs',
  },
  {
    pattern: 'rounded-\\[[0-9]+px\\]',
    message: '角丸はトークンを使用 (rounded-sm, rounded-md 等)',
    suggestion: 'rounded-[2px] → rounded-sm',
  },
  {
    pattern: 'h-\\[(1|2)px\\]',
    message: '線の高さはトークンを使用',
    suggestion: 'h-[1px] → h-px, h-[2px] → h-0.5',
  },
  {
    pattern: 'min-h-\\[44px\\]',
    message: 'タッチターゲットはトークンを使用',
    suggestion: 'min-h-[44px] → min-h-11',
  },
  // カラートークン準拠
  {
    pattern: 'border-black/|border-white/',
    message: '手書き border 色は禁止。border-border / border-border-subtle を使用',
    suggestion: 'border-black/[0.04] → border-border-subtle',
  },
  {
    pattern: 'shadow-\\[',
    message: '任意 shadow 値は禁止。shadow-sm / shadow-card を使用',
    suggestion: 'shadow-[...] → shadow-card',
  },
  {
    pattern: 'bg-(primary|success|warning|destructive|info)/[0-9]',
    message: 'semantic 色の opacity 派生は禁止。tint トークンまたは state トークンを使用',
    suggestion: 'bg-success/10 → bg-success-tint, bg-primary/10 → bg-primary-state-selected',
  },
  {
    pattern:
      '(text|border|bg)-(foreground|muted-foreground|border|muted|entry-default|surface-container)/[0-9]',
    message: 'neutral トークンの opacity 派生は禁止。named トークンを使用',
    suggestion:
      'text-foreground/80 → text-muted-foreground, border-border/50 → border-border-subtle',
  },
];

let hasViolations = false;
let hasWarnings = false;

console.log('🔍 Tailwind トークン違反をチェック中...\n');

for (const { pattern, message, suggestion, warnOnly } of FORBIDDEN_PATTERNS) {
  try {
    const result = execSync(`grep -rE "${pattern}" src --include="*.tsx" -l 2>/dev/null || true`, {
      encoding: 'utf8',
    }).trim();

    if (result) {
      if (warnOnly) {
        hasWarnings = true;
        console.log(`⚠️  [warn] ${message}`);
      } else {
        hasViolations = true;
        console.log(`❌ ${message}`);
      }
      console.log(`   修正例: ${suggestion}`);
      console.log(`   該当ファイル:`);
      result.split('\n').forEach((file) => {
        console.log(`     - ${file}`);
      });
      console.log('');
    }
  } catch {
    // grep エラーは無視
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
