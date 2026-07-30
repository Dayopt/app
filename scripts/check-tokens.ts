#!/usr/bin/env node

/**
 * Tailwind トークン違反チェッカー（repo 横断）
 *
 * トークン化すべき任意値・規約外の値を検出し、修正を促す。
 * pnpm lint:tokens で実行。
 *
 * 走査対象は SCAN_TARGETS。以前は apps/product の tsx だけだったため、
 * apps/web と packages/components が未統治のまま規約外の値を溜めていた
 * （motion / spacing の監査で 2 回続けて同じ穴に当たった）。
 *
 * 除外は EXCLUDE_PATHS。プロダクト UI のミニチュアを描くマーケの
 * イラスト層は、縮尺のために UI 用スケールの外に出る必要があるので
 * 任意値ルールから外す（本物の UI ではなく絵）。
 */

import { execSync } from 'node:child_process';

/** 走査するディレクトリ（repo ルートからの相対） */
const SCAN_TARGETS = ['apps/product/src', 'apps/web/src', 'packages/components/src'];

/**
 * 任意値ルールの適用外。grep -v で除外する。
 * マーケの mocks / *Visual.tsx はプロダクト画面の縮小イラストで、
 * text-[10px] のような UI スケール外の値が絵として必要になる。
 */
const EXCLUDE_PATHS = [
  'apps/web/src/features/marketing/components/mocks/',
  'Visual.tsx',
  'AppPreviewMockup.tsx',
];

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
    message: '角丸の任意値は禁止。rounded-lg (8px) / rounded-2xl (16px) を使用',
    suggestion: 'rounded-[8px] → rounded-lg',
  },
  {
    pattern: '(?<![a-z0-9-])rounded(?:-sm|-md|-xl|-xs|-3xl)(?![a-z0-9-])',
    message: '廃止された角丸クラス。rounded-lg (8px) / rounded-2xl (16px) を使用',
    suggestion: 'rounded-sm → rounded-lg, rounded-xl → rounded-2xl',
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
    // shadow-[var(--...)] は token 参照なので許可する（誤検出だった）
    pattern: 'shadow-\\[(?!var\\()',
    message: '任意 shadow 値は禁止。shadow-sm / shadow-card を使用',
    suggestion: 'shadow-[0_1px_2px_...] → shadow-card',
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
  // フォントウェイト準拠（font-normal / font-medium のみ）
  {
    pattern: '(?<![a-z0-9-])font-(?:bold|semibold|extrabold|black|light|thin)(?![a-z0-9-])',
    message: '禁止フォントウェイト。font-normal (400) / font-medium (500) のみ使用可',
    suggestion: 'font-bold → font-medium, font-semibold → font-medium',
  },
  // bare rounded 禁止（rounded-lg / rounded-2xl / rounded-full / rounded-none のみ）
  {
    pattern: '(?<![a-z0-9-])rounded(?![a-z0-9-])',
    message: 'bare rounded は禁止。rounded-lg (8px) を使用',
    suggestion: 'rounded → rounded-lg',
  },
  // 直接カラークラス禁止（semantic token を使用）
  {
    pattern:
      '(?:text|bg|border)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]',
    message: '直接カラークラスは禁止。semantic token を使用',
    suggestion: 'text-gray-500 → text-muted-foreground, bg-blue-500 → bg-primary',
    warnOnly: true, // stories のドキュメント例を含むため段階移行
  },
  // スペーシンググリッド準拠（8px + 4pxサブグリッド）
  // 許可値: 0(0px), 1(4px), 2(8px), 4(16px), 6(24px), 8(32px), 12(48px), 16(64px), 24(96px)
  {
    pattern:
      '(^|[^a-z])(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y)-(0\\.5|1\\.5|2\\.5|3\\.5)',
    message: 'OFF-GRID スペーシング（小数値）。8pxグリッド準拠の値を使用',
    suggestion: '*-0.5(2px) → *-0/*-1, *-1.5(6px) → *-1/*-2, *-2.5(10px) → *-2, *-3.5(14px) → *-4',
  },
  {
    pattern:
      '(^|[^a-z])(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y)-(5|7|9|11|13)([^0-9.]|$)',
    message: 'OFF-GRID スペーシング（禁止整数値: 20/28/36/44/52px）。8pxグリッド準拠の値を使用',
    suggestion: '*-5(20px) → *-4/*-6, *-7(28px) → *-6/*-8, *-9(36px) → *-8',
  },
  // モーション（方針の正本: packages/foundations/src/tokens/Motion.mdx）
  // NOTE: 走査対象は *.tsx のみ。CSS ファイル内の値は Motion.mdx とレビューで担保する。
  {
    pattern: 'duration-(0|75|100|500|700|1000)([^0-9]|$)',
    message: '禁止 duration。遷移は duration-150 / 200 / 300 の3段のみ',
    suggestion: 'duration-500 → duration-300, duration-75 → duration-150',
  },
  {
    pattern: 'duration-\\[',
    message: 'duration の任意値は禁止。3段（150/200/300）から選ぶ',
    suggestion: 'duration-[420ms] → duration-300',
  },
  {
    pattern: '(^|[^a-z-])ease-(in-out|in|out)([^a-z-]|$)',
    message:
      '生の easing は禁止。ease-standard（その場で変わる）/ ease-settle（入る・着地する）を使用',
    suggestion: 'ease-out → ease-settle, ease-in-out → ease-standard, ease-in → ease-standard',
  },
  {
    pattern: 'cubic-bezier',
    message:
      'cubic-bezier の直書きは禁止。var(--motion-ease-standard) / var(--motion-ease-settle) を参照',
    suggestion: 'cubic-bezier(0.25, 0.1, 0.25, 1) → var(--motion-ease-settle)',
  },
];

let hasViolations = false;
let hasWarnings = false;

console.log('🔍 Tailwind トークン違反をチェック中...\n');

const TARGETS = SCAN_TARGETS.join(' ');
const EXCLUDE_FILTER = EXCLUDE_PATHS.map((p) => `| grep -v "${p}"`).join(' ');

for (const { pattern, message, suggestion, warnOnly } of FORBIDDEN_PATTERNS) {
  try {
    const result = execSync(
      `grep -rE "${pattern}" ${TARGETS} --include="*.tsx" -l 2>/dev/null ${EXCLUDE_FILTER} || true`,
      { encoding: 'utf8' },
    ).trim();

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

// ─── 共起チェック: bg-card には shadow が必要（Elevation ルール） ───
try {
  const bgCardLines = execSync(
    `grep -rn "bg-card" ${TARGETS} --include="*.tsx" 2>/dev/null || true`,
    {
      encoding: 'utf8',
    },
  ).trim();

  if (bgCardLines) {
    const violations: string[] = [];

    for (const line of bgCardLines.split('\n')) {
      if (!line) continue;

      // 除外: stories, shadcn/ui プリミティブ, opacity 派生 (bg-card/)
      if (line.includes('.stories.') || line.includes('components/ui/') || /bg-card\//.test(line)) {
        continue;
      }

      // shadow-xs / shadow-sm / shadow-card のいずれかが同一行にあれば OK
      if (/shadow-(xs|sm|card)/.test(line)) continue;

      violations.push(line);
    }

    if (violations.length > 0) {
      hasWarnings = true;
      console.log('⚠️  [warn] bg-card に shadow がない（Elevation ルール違反）');
      console.log('   修正例: bg-card は shadow-sm (Raised) / shadow-card (Overlay) と併用');
      console.log('   該当箇所:');
      for (const v of violations) {
        // "src/path:line: content" → 見やすく整形
        const [loc, ...rest] = v.split(':');
        const lineNum = rest[0];
        const content = rest.slice(1).join(':').trim();
        console.log(`     - ${loc}:${lineNum}: ${content.slice(0, 80)}`);
      }
      console.log('');
    }
  }
} catch {
  // grep エラーは無視
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
