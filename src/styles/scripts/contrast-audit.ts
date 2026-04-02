/**
 * WCAG 2.1 AA コントラスト比監査スクリプト
 *
 * culori を使って OKLCH カラーペアのコントラスト比を算出し、
 * PASS/FAIL を判定する。
 *
 * Usage: npx tsx src/styles/scripts/contrast-audit.ts
 */
// @ts-expect-error -- culori has no type declarations
import { converter, parse, wcagContrast } from 'culori';

const toRgb = converter('rgb');

/** OKLCH 文字列 → sRGB → WCAG コントラスト比 */
function contrast(fg: string, bg: string): number {
  const fgRgb = toRgb(parse(fg));
  const bgRgb = toRgb(parse(bg));
  if (!fgRgb || !bgRgb) throw new Error(`Parse failed: fg=${fg}, bg=${bg}`);
  return wcagContrast(fgRgb, bgRgb);
}

type Threshold = '4.5:1 (AA text)' | '3:1 (AA large/non-text)';

interface Pair {
  label: string;
  fg: string;
  bg: string;
  threshold: Threshold;
  mode: 'light' | 'dark' | 'both';
}

// ============================================
// 現在の値 — colors.css と完全同期 (2026-04-02)
// ============================================
const CURRENT: Pair[] = [
  // --- Light mode: text on surfaces ---
  {
    label: 'foreground on background',
    fg: 'oklch(0.13 0 0)', // --foreground = --neutral-13
    bg: 'oklch(0.98 0 0)', // --background = --neutral-98
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'foreground on card',
    fg: 'oklch(0.13 0 0)',
    bg: 'oklch(1 0 0)', // --card = --white
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'foreground on container',
    fg: 'oklch(0.13 0 0)',
    bg: 'oklch(0.96 0 0)', // --container = --neutral-96
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'muted-fg on background',
    fg: 'oklch(0.4 0 0)', // --muted-foreground
    bg: 'oklch(0.98 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'muted-fg on card',
    fg: 'oklch(0.4 0 0)',
    bg: 'oklch(1 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'muted-fg on container',
    fg: 'oklch(0.4 0 0)',
    bg: 'oklch(0.96 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'muted-fg on muted',
    fg: 'oklch(0.4 0 0)',
    bg: 'oklch(0.95 0 0)', // --muted = --neutral-95
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  // muted-fg on tag tint backgrounds (EntryCard)
  {
    label: 'muted-fg on tag-tint (light)',
    fg: 'oklch(0.4 0 0)',
    bg: 'oklch(0.92 0.05 240)', // tag tint L=0.92 (worst case: blue)
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },

  // --- Dark mode: text on surfaces ---
  {
    label: 'foreground on background',
    fg: 'oklch(0.9 0.005 70)', // --foreground (dark)
    bg: 'oklch(0.18 0.008 60)', // --background (dark)
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'foreground on card',
    fg: 'oklch(0.9 0.005 70)',
    bg: 'oklch(0.22 0.008 60)', // --card (dark)
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'foreground on container',
    fg: 'oklch(0.9 0.005 70)',
    bg: 'oklch(0.15 0.008 60)', // --container (dark)
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'muted-fg on background',
    fg: 'oklch(0.68 0.005 60)', // --muted-foreground (dark)
    bg: 'oklch(0.18 0.008 60)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'muted-fg on card',
    fg: 'oklch(0.68 0.005 60)',
    bg: 'oklch(0.22 0.008 60)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'muted-fg on container',
    fg: 'oklch(0.68 0.005 60)',
    bg: 'oklch(0.15 0.008 60)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'muted-fg on muted',
    fg: 'oklch(0.68 0.005 60)',
    bg: 'oklch(0.25 0.008 60)', // --muted (dark)
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  // muted-fg on tag tint backgrounds (EntryCard — dark)
  {
    label: 'muted-fg on tag-tint (dark)',
    fg: 'oklch(0.68 0.005 60)',
    bg: 'oklch(0.28 0.06 240)', // tag tint dark L=0.28
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },

  // --- Light mode: semantic text on surfaces ---
  {
    label: 'text-destructive on card (light)',
    fg: 'oklch(0.54 0.18 25)', // --destructive (light)
    bg: 'oklch(1 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'text-destructive on background (light)',
    fg: 'oklch(0.54 0.18 25)',
    bg: 'oklch(0.98 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'text-success on card (light)',
    fg: 'oklch(0.50 0.15 150)', // --success (light)
    bg: 'oklch(1 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'text-warning on card (light)',
    fg: 'oklch(0.55 0.16 70)', // --warning (light)
    bg: 'oklch(1 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'text-info on card (light)',
    fg: 'oklch(0.55 0.02 260)', // --info (light)
    bg: 'oklch(1 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },

  // --- Dark mode: semantic text on surfaces ---
  {
    label: 'text-destructive on card (dark)',
    fg: 'oklch(0.65 0.14 25)', // --destructive (dark)
    bg: 'oklch(0.22 0.008 60)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'text-destructive on background (dark)',
    fg: 'oklch(0.65 0.14 25)',
    bg: 'oklch(0.18 0.008 60)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'text-success on card (dark)',
    fg: 'oklch(0.65 0.12 150)', // --success (dark)
    bg: 'oklch(0.22 0.008 60)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'text-warning on card (dark)',
    fg: 'oklch(0.72 0.14 70)', // --warning (dark)
    bg: 'oklch(0.22 0.008 60)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'text-info on card (dark)',
    fg: 'oklch(0.65 0.02 260)', // --info (dark)
    bg: 'oklch(0.22 0.008 60)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },

  // --- Foreground on semantic backgrounds ---
  {
    label: 'white on primary (light)',
    fg: 'oklch(1 0 0)',
    bg: 'oklch(0.45 0.14 259.8145)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'white on primary (dark)',
    fg: 'oklch(1 0 0)',
    bg: 'oklch(0.5 0.188 259.8145)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'white on destructive (light)',
    fg: 'oklch(1 0 0)',
    bg: 'oklch(0.54 0.18 25)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'dark-fg on destructive (dark)',
    fg: 'oklch(0.15 0 0)', // --destructive-foreground dark = --neutral-15
    bg: 'oklch(0.65 0.14 25)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'white on success (light)',
    fg: 'oklch(1 0 0)',
    bg: 'oklch(0.50 0.15 150)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'white on warning (light)',
    fg: 'oklch(1 0 0)',
    bg: 'oklch(0.55 0.16 70)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },

  // --- Charts on card (dark, 3:1 non-text) ---
  {
    label: 'chart-4 on card (dark)',
    fg: 'oklch(0.55 0.2 264.38)', // --chart-4 (dark)
    bg: 'oklch(0.22 0.008 60)',
    threshold: '3:1 (AA large/non-text)',
    mode: 'dark',
  },
  {
    label: 'chart-5 on card (dark)',
    fg: 'oklch(0.55 0.16 265.64)', // --chart-5 (dark)
    bg: 'oklch(0.22 0.008 60)',
    threshold: '3:1 (AA large/non-text)',
    mode: 'dark',
  },
];

// ============================================
// Runner
// ============================================
function runAudit(label: string, pairs: Pair[]) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${'='.repeat(60)}\n`);

  let pass = 0;
  let fail = 0;

  for (const p of pairs) {
    const ratio = contrast(p.fg, p.bg);
    const required = p.threshold === '4.5:1 (AA text)' ? 4.5 : 3.0;
    const ok = ratio >= required;
    const icon = ok ? '✅' : '❌';
    const status = ok ? 'PASS' : 'FAIL';

    if (ok) pass++;
    else fail++;

    console.log(
      `${icon} ${status} ${ratio.toFixed(2)}:1 (need ${required}:1) [${p.mode}] ${p.label}`,
    );
  }

  console.log(`\nResults: ${pass} passed, ${fail} failed out of ${pairs.length} total`);
  return fail;
}

const fails = runAudit('CURRENT TOKEN VALUES (colors.css synced 2026-04-02)', CURRENT);

console.log('\n' + '='.repeat(60));
if (fails === 0) {
  console.log('  🎉 All current values PASS WCAG 2.1 AA!');
} else {
  console.log(`  ⚠️  ${fails} value(s) FAIL — L値の調整が必要`);
}
console.log('='.repeat(60));

process.exit(fails > 0 ? 1 : 0);
