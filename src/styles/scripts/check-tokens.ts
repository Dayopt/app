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
];

let hasViolations = false;

console.log('🔍 Tailwind トークン違反をチェック中...\n');

for (const { pattern, message, suggestion } of FORBIDDEN_PATTERNS) {
  try {
    const result = execSync(`grep -rE "${pattern}" src --include="*.tsx" -l 2>/dev/null || true`, {
      encoding: 'utf8',
    }).trim();

    if (result) {
      hasViolations = true;
      console.log(`❌ ${message}`);
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
} else {
  console.log('✅ トークン違反なし');
  process.exit(0);
}
