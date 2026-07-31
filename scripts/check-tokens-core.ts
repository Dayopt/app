/**
 * check-tokens の判定コア（pure function 層）
 *
 * grep（check-tokens.ts 側）は「候補ファイルを見つける」だけに使い、
 * 行単位の違反判定はここの findRuleViolations が正。こう分けるのは、
 * lookaround 入りルールが ERE 非対応で数ヶ月無言で壊れていた前科への対策で、
 * 判定ロジックを文字列 fixture で直接テストできる形に固定するため
 * （scripts/__tests__/check-tokens.test.ts）。
 *
 * このファイルは I/O（spawnSync / readFileSync / console）を持たない。
 */

/** 走査するディレクトリ（repo ルートからの相対） */
export const SCAN_TARGETS = [
  'apps/product/src',
  'apps/web/src',
  'packages/components/src',
  'packages/foundations/src',
];

/**
 * 全ルールの適用外パス（一部ルールだけではなく一律で外れる）。
 *
 * マーケの mocks / *Visual.tsx / AppPreviewMockup.tsx はプロダクト画面の
 * 縮小イラストで、縮尺のために UI 用スケールの外に出る必要がある（絵であって
 * 本物の UI ではない）。logo.tsx は size-5 のブランドタイルで、8px 角丸だと
 * 丸すぎるため 4px の任意値を持つ。
 */
export const EXCLUDE_PATHS = [
  'apps/web/src/features/marketing/components/mocks/',
  'Visual.tsx',
  'AppPreviewMockup.tsx',
  'packages/components/src/identity/logo.tsx',
];

/**
 * 個別行の許可マーカー。違反行の同一行または直前行にこの文字列を置くと除外される。
 * 教材（Storybook の「悪い例」提示など、禁止クラスをあえて見せる箇所）用。
 * 理由をコメントとして併記する運用（例: `{/* lint-tokens-allow: 禁止例の提示 *​/}`）。
 *
 * マーカーを含む行自身はそもそも違反として数えない。マーカーコメントの中に
 * 禁止語を書いた瞬間にそのコメント自身が違反になる、という再発（elevation-exempt /
 * eslint-disable コメントで実際に起きた形）を構造的に防ぐ。
 */
export const ALLOW_MARKER = 'lint-tokens-allow';

export interface ForbiddenPattern {
  /**
   * grep -E（ERE）と JS RegExp の両方で解釈できる正規表現。
   * lookahead / lookbehind は使えない（grep 側が即死する）。
   * 境界の文字クラスは [^a-zA-Z0-9-] 形式にする。小文字だけ
   * （[^a-z0-9-]）だと camelCase 識別子（roundedStart 等）の
   * 大文字境界にマッチして誤検出する。
   */
  pattern: string;
  message: string;
  suggestion: string;
  /** マッチ行のうち、これに当たるものは違反として数えない（JS の RegExp で評価） */
  excludePattern?: string;
  /** true = 検出するが CI を block しない（段階移行中のルール） */
  warnOnly?: boolean;
}

// 禁止パターン（トークン化すべき任意値）
export const FORBIDDEN_PATTERNS: ForbiddenPattern[] = [
  {
    pattern: 'text-\\[[0-9]+px\\]',
    message: 'フォントサイズはトークンを使用 (text-xs, text-sm 等)',
    suggestion: 'text-[10px] → text-xs',
  },
  {
    pattern: 'rounded(-[a-z]+)?-\\[',
    // rounded-[inherit] は pseudo-element が親の radius を継承する正当な用途
    // （useTimeblockCardLayout.ts に理由コメント付きで存在）
    excludePattern: 'rounded(-[a-z]+)?-\\[inherit\\]',
    message: '角丸の任意値は禁止。rounded-lg (8px) / rounded-2xl (16px) を使用',
    suggestion: 'rounded-[8px] → rounded-lg, rounded-[0.25rem] → rounded-lg',
  },
  {
    pattern:
      '(^|[^a-zA-Z0-9-])rounded(-(t|r|b|l|tl|tr|br|bl|s|e|ss|se|es|ee))?-(sm|md|xl|xs|3xl)([^a-zA-Z0-9-]|$)',
    message: '廃止された角丸クラス。rounded-lg (8px) / rounded-2xl (16px) を使用',
    suggestion: 'rounded-sm → rounded-lg, rounded-xl → rounded-2xl',
  },
  {
    pattern: 'h-\\[(1|2)px\\]',
    message: '線の高さはトークンを使用',
    suggestion: 'h-[1px] → h-px, h-[2px] → h-0.5',
  },
  {
    // 既存 h-\[(1|2)px\] の対。罫線幅に限定した狭い形のまま維持する
    // （w-\[ 全体へ広げると Storybook canvas 幅の正当な任意値を巻き込む）
    pattern: 'w-\\[(1|2)px\\]',
    message: '線の幅はトークンを使用',
    suggestion: 'w-[1px] → w-px, w-[2px] → w-0.5',
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
    pattern: '(^|[^a-zA-Z0-9-])font-(bold|semibold|extrabold|black|light|thin)([^a-zA-Z0-9-]|$)',
    message: '禁止フォントウェイト。font-normal (400) / font-medium (500) のみ使用可',
    suggestion: 'font-bold → font-medium, font-semibold → font-medium',
  },
  // bare rounded 禁止（rounded-lg / rounded-2xl / rounded-full / rounded-none のみ）
  {
    // 境界は [^a-zA-Z0-9-]。小文字だけだと roundedStart / roundedMinutes の
    // ような camelCase 識別子の大文字境界にマッチしてしまう（実際に 9 件誤検出した）
    pattern: '(^|[^a-zA-Z0-9-])rounded([^a-zA-Z0-9-]|$)',
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
  // z-index 準拠
  {
    pattern: 'z-\\[',
    message: '任意値 z-index は禁止。z-index トークンを使用',
    suggestion: 'z-[100] → z-index トークン（z-modal 等）',
  },
  // スペーシンググリッド準拠（8px + 4pxサブグリッド）
  // 許可値: 0(0px), 1(4px), 2(8px), 4(16px), 6(24px), 8(32px), 12(48px), 16(64px), 24(96px)
  {
    pattern:
      '(^|[^a-zA-Z])(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y)-(0\\.5|1\\.5|2\\.5|3\\.5)',
    message: 'OFF-GRID スペーシング（小数値）。8pxグリッド準拠の値を使用',
    suggestion: '*-0.5(2px) → *-0/*-1, *-1.5(6px) → *-1/*-2, *-2.5(10px) → *-2, *-3.5(14px) → *-4',
  },
  {
    pattern:
      '(^|[^a-zA-Z])(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y)-(5|7|9|11|13)([^0-9.]|$)',
    message: 'OFF-GRID スペーシング（禁止整数値: 20/28/36/44/52px）。8pxグリッド準拠の値を使用',
    suggestion: '*-5(20px) → *-4/*-6, *-7(28px) → *-6/*-8, *-9(36px) → *-8',
  },
  {
    pattern: '(^|[^a-zA-Z0-9-])(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y)-\\[',
    message: '任意値スペーシングは禁止。8pxグリッド準拠のスケール値を使用',
    suggestion: 'sm:pt-[140px] → sm:pt-36, sm:mb-[80px] → sm:mb-20',
  },
  // タイポグラフィスケール準拠（type scale は 6xl まで。--text-* theme reset の代替ガード）
  {
    pattern: '(^|[^a-zA-Z0-9-])text-(7xl|8xl|9xl)([^a-zA-Z0-9-]|$)',
    message: '特大文字サイズは禁止。type scale は text-6xl まで',
    suggestion: 'text-7xl → text-6xl',
  },
  // モーション（方針の正本: packages/foundations/src/tokens/Motion.mdx）
  // NOTE: 走査対象は *.ts / *.tsx。CSS ファイル内の値は Motion.mdx とレビューで担保する。
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
    pattern: '(^|[^a-zA-Z-])ease-(in-out|in|out)([^a-zA-Z-]|$)',
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

/** path（または grep の "path:line:content" 行）が全ルール適用外か */
export function isExcludedPath(pathOrLine: string): boolean {
  return EXCLUDE_PATHS.some((p) => pathOrLine.includes(p));
}

/**
 * 1 行がルールにマッチするか（マーカー・直前行は見ない、行単体の判定）。
 * pattern → excludePattern の順に適用する。
 */
export function ruleMatchesLine(rule: ForbiddenPattern, content: string): boolean {
  if (!new RegExp(rule.pattern).test(content)) return false;
  if (rule.excludePattern && new RegExp(rule.excludePattern).test(content)) return false;
  return true;
}

/**
 * ファイル内容（行配列）に対する 1 ルールの違反行番号（1-based）を返す。
 *
 * 判定順:
 * 1. ALLOW_MARKER を含む行自身は違反として数えない
 * 2. pattern にマッチしない行は対象外
 * 3. excludePattern にマッチする行は対象外
 * 4. 直前行に ALLOW_MARKER があれば除外
 */
export function findRuleViolations(rule: ForbiddenPattern, lines: string[]): number[] {
  const violations: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const content = lines[i];
    if (content.includes(ALLOW_MARKER)) continue;
    if (!ruleMatchesLine(rule, content)) continue;
    if (i > 0 && lines[i - 1].includes(ALLOW_MARKER)) continue;
    violations.push(i + 1);
  }
  return violations;
}
