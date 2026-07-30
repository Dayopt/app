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
 * 全ルールから外す（本物の UI ではなく絵）。
 */

import { spawnSync } from 'node:child_process';

/** 走査するディレクトリ（repo ルートからの相対） */
const SCAN_TARGETS = ['apps/product/src', 'apps/web/src', 'packages/components/src'];

/**
 * 全ルールの適用外パス（一部ルールだけではなく一律で外れる）。
 *
 * マーケの mocks / *Visual.tsx / AppPreviewMockup.tsx はプロダクト画面の
 * 縮小イラストで、縮尺のために UI 用スケールの外に出る必要がある（絵であって
 * 本物の UI ではない）。logo.tsx は size-5 のブランドタイルで、8px 角丸だと
 * 丸すぎるため 4px の任意値を持つ。
 */
const EXCLUDE_PATHS = [
  'apps/web/src/features/marketing/components/mocks/',
  'Visual.tsx',
  'AppPreviewMockup.tsx',
  'packages/components/src/identity/logo.tsx',
];

interface ForbiddenPattern {
  /** grep -E（ERE）で解釈できる正規表現。lookahead / lookbehind は使えない */
  pattern: string;
  message: string;
  suggestion: string;
  /** マッチ行のうち、これに当たるものは違反として数えない（JS の RegExp で評価） */
  excludePattern?: string;
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
    pattern: 'rounded(-[a-z]+)?-\\[',
    message: '角丸の任意値は禁止。rounded-lg (8px) / rounded-2xl (16px) を使用',
    suggestion: 'rounded-[8px] → rounded-lg, rounded-[0.25rem] → rounded-lg',
  },
  {
    pattern:
      '(^|[^a-z0-9-])rounded(-(t|r|b|l|tl|tr|br|bl|s|e|ss|se|es|ee))?-(sm|md|xl|xs|3xl)([^a-z0-9-]|$)',
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
    pattern: 'shadow-\\[',
    // shadow-[var(--...)] は token 参照なので違反にしない
    excludePattern: 'shadow-\\[var\\(',
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
    pattern: '(^|[^a-z0-9-])font-(bold|semibold|extrabold|black|light|thin)([^a-z0-9-]|$)',
    message: '禁止フォントウェイト。font-normal (400) / font-medium (500) のみ使用可',
    suggestion: 'font-bold → font-medium, font-semibold → font-medium',
  },
  // bare rounded 禁止（rounded-lg / rounded-2xl / rounded-full / rounded-none のみ）
  {
    pattern: '(^|[^a-z0-9-])rounded([^a-z0-9-]|$)',
    // `const rounded = ...` のような識別子は Tailwind クラスではない。
    // 宣言・代入・参照の形を除く（クラス名は文字列の中にしか現れない）
    excludePattern: '(const|let|var)\\s+rounded|rounded\\s*[=/%)]',
    message: 'bare rounded は禁止。rounded-lg (8px) を使用',
    suggestion: 'rounded → rounded-lg',
  },
  // 直接カラークラス禁止（semantic token を使用）
  {
    pattern:
      '(text|bg|border)-(gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]',
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
  const res = spawnSync('grep', ['-rEn', pattern, '--include=*.tsx', ...SCAN_TARGETS], {
    encoding: 'utf8',
  });

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
    .filter((line) => !EXCLUDE_PATHS.some((p) => line.includes(p)));
}

console.log('🔍 Tailwind トークン違反をチェック中...\n');

for (const { pattern, message, suggestion, warnOnly, excludePattern } of FORBIDDEN_PATTERNS) {
  let lines = grepLines(pattern);

  if (excludePattern) {
    const re = new RegExp(excludePattern);
    lines = lines.filter((line) => !re.test(line));
  }

  if (lines.length === 0) continue;

  const files = [...new Set(lines.map((line) => line.split(':')[0]))];

  if (warnOnly) {
    hasWarnings = true;
    console.log(`⚠️  [warn] ${message}`);
  } else {
    hasViolations = true;
    console.log(`❌ ${message}`);
  }
  console.log(`   修正例: ${suggestion}`);
  console.log(`   該当ファイル（${lines.length} 箇所 / ${files.length} ファイル）:`);
  files.forEach((file) => {
    console.log(`     - ${file}`);
  });
  console.log('');
}

// ─── 共起チェック: bg-card には shadow が必要（Elevation ルール） ───
{
  const violations: string[] = [];

  for (const line of grepLines('bg-card')) {
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
    console.log(`   該当箇所（${violations.length} 件）:`);
    for (const v of violations) {
      // "path:line:content" → 見やすく整形
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
