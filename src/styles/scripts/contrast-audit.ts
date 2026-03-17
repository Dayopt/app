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
// 現在の値（Before）
// ============================================
const CURRENT: Pair[] = [
  // --- Light mode text on surfaces ---
  {
    label: 'foreground on background',
    fg: 'oklch(0.25 0 0)',
    bg: 'oklch(0.99 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'muted-fg on card',
    fg: 'oklch(0.35 0.02 264.54)',
    bg: 'oklch(0.90 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'muted-fg on container',
    fg: 'oklch(0.35 0.02 264.54)',
    bg: 'oklch(0.93 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },

  // --- Dark mode text on surfaces ---
  {
    label: 'foreground on background',
    fg: 'oklch(0.9219 0 0)',
    bg: 'oklch(0.24 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'muted-fg on card',
    fg: 'oklch(0.78 0 0)',
    bg: 'oklch(0.12 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'muted-fg on container',
    fg: 'oklch(0.78 0 0)',
    bg: 'oklch(0.18 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },

  // --- Semantic text on light surfaces (CURRENT - no dark overrides) ---
  {
    label: 'text-destructive on card (light)',
    fg: 'oklch(0.6368 0.2078 25.3313)',
    bg: 'oklch(0.90 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'text-destructive on bg (dark, CURRENT)',
    fg: 'oklch(0.6368 0.2078 25.3313)',
    bg: 'oklch(0.24 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'text-destructive on card (dark, CURRENT)',
    fg: 'oklch(0.6368 0.2078 25.3313)',
    bg: 'oklch(0.12 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },

  {
    label: 'text-success on card (light)',
    fg: 'oklch(0.5859 0.1684 149.2)',
    bg: 'oklch(0.90 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'text-success on bg (dark, CURRENT)',
    fg: 'oklch(0.5859 0.1684 149.2)',
    bg: 'oklch(0.24 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'text-success on card (dark, CURRENT)',
    fg: 'oklch(0.5859 0.1684 149.2)',
    bg: 'oklch(0.12 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },

  {
    label: 'text-warning on card (light)',
    fg: 'oklch(0.7039 0.1555 68.04)',
    bg: 'oklch(0.90 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'text-warning on bg (dark, CURRENT)',
    fg: 'oklch(0.7039 0.1555 68.04)',
    bg: 'oklch(0.24 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },

  {
    label: 'text-info on card (light, CURRENT gray)',
    fg: 'oklch(0.40 0 0)',
    bg: 'oklch(0.90 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'text-info on bg (dark, CURRENT gray)',
    fg: 'oklch(0.40 0 0)',
    bg: 'oklch(0.24 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'text-info on card (dark, CURRENT gray)',
    fg: 'oklch(0.40 0 0)',
    bg: 'oklch(0.12 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },

  // --- Foreground on semantic backgrounds ---
  {
    label: 'white on warning bg (CURRENT)',
    fg: 'oklch(1 0 0)',
    bg: 'oklch(0.7039 0.1555 68.04)',
    threshold: '4.5:1 (AA text)',
    mode: 'both',
  },
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
    label: 'white on destructive',
    fg: 'oklch(1 0 0)',
    bg: 'oklch(0.6368 0.2078 25.3313)',
    threshold: '4.5:1 (AA text)',
    mode: 'both',
  },
  {
    label: 'white on success',
    fg: 'oklch(1 0 0)',
    bg: 'oklch(0.5859 0.1684 149.2)',
    threshold: '4.5:1 (AA text)',
    mode: 'both',
  },
];

// ============================================
// 提案値（After）
// ============================================
const PROPOSED: Pair[] = [
  // ============================================
  // Light mode — revised semantic colors (darker for card contrast)
  // ============================================

  // destructive: oklch(0.6368 0.2078 25.33) → oklch(0.52 0.22 25.33)
  {
    label: 'text-destructive on card (light)',
    fg: 'oklch(0.52 0.22 25.33)',
    bg: 'oklch(0.90 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'text-destructive on bg (light)',
    fg: 'oklch(0.52 0.22 25.33)',
    bg: 'oklch(0.99 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'white on destructive bg (light)',
    fg: 'oklch(1 0 0)',
    bg: 'oklch(0.52 0.22 25.33)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },

  // success: oklch(0.5859 0.1684 149.2) → oklch(0.47 0.17 149.2)
  {
    label: 'text-success on card (light)',
    fg: 'oklch(0.47 0.17 149.2)',
    bg: 'oklch(0.90 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'text-success on bg (light)',
    fg: 'oklch(0.47 0.17 149.2)',
    bg: 'oklch(0.99 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'white on success bg (light)',
    fg: 'oklch(1 0 0)',
    bg: 'oklch(0.47 0.17 149.2)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },

  // warning: oklch(0.7039 0.1555 68.04) → oklch(0.48 0.16 68.04)
  // Note: yellow/amber has high luminance; darker value enables white foreground
  {
    label: 'text-warning on card (light)',
    fg: 'oklch(0.48 0.16 68.04)',
    bg: 'oklch(0.90 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'text-warning on bg (light)',
    fg: 'oklch(0.48 0.16 68.04)',
    bg: 'oklch(0.99 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'white on warning bg (light)',
    fg: 'oklch(1 0 0)',
    bg: 'oklch(0.48 0.16 68.04)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },

  // info: oklch(0.40 0 0) → oklch(0.48 0.17 250)
  {
    label: 'text-info on card (light)',
    fg: 'oklch(0.48 0.17 250)',
    bg: 'oklch(0.90 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'text-info on bg (light)',
    fg: 'oklch(0.48 0.17 250)',
    bg: 'oklch(0.99 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'white on info bg (light)',
    fg: 'oklch(1 0 0)',
    bg: 'oklch(0.48 0.17 250)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },

  // ============================================
  // Dark mode — semantic overrides
  // ============================================

  // destructive dark: oklch(0.72 0.19 25.33)
  {
    label: 'text-destructive on bg (dark)',
    fg: 'oklch(0.72 0.19 25.33)',
    bg: 'oklch(0.24 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'text-destructive on card (dark)',
    fg: 'oklch(0.72 0.19 25.33)',
    bg: 'oklch(0.12 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'text-destructive on container (dark)',
    fg: 'oklch(0.72 0.19 25.33)',
    bg: 'oklch(0.18 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'dark-fg on destructive bg (dark)',
    fg: 'oklch(0.15 0 0)',
    bg: 'oklch(0.72 0.19 25.33)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },

  // warning dark: oklch(0.78 0.14 68.04)
  {
    label: 'text-warning on bg (dark)',
    fg: 'oklch(0.78 0.14 68.04)',
    bg: 'oklch(0.24 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'text-warning on card (dark)',
    fg: 'oklch(0.78 0.14 68.04)',
    bg: 'oklch(0.12 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'dark-fg on warning bg (dark)',
    fg: 'oklch(0.15 0 0)',
    bg: 'oklch(0.78 0.14 68.04)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },

  // success dark: oklch(0.72 0.15 149.2)
  {
    label: 'text-success on bg (dark)',
    fg: 'oklch(0.72 0.15 149.2)',
    bg: 'oklch(0.24 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'text-success on card (dark)',
    fg: 'oklch(0.72 0.15 149.2)',
    bg: 'oklch(0.12 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'dark-fg on success bg (dark)',
    fg: 'oklch(0.15 0 0)',
    bg: 'oklch(0.72 0.15 149.2)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },

  // info dark: oklch(0.72 0.12 250)
  {
    label: 'text-info on bg (dark)',
    fg: 'oklch(0.72 0.12 250)',
    bg: 'oklch(0.24 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'text-info on card (dark)',
    fg: 'oklch(0.72 0.12 250)',
    bg: 'oklch(0.12 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'dark-fg on info bg (dark)',
    fg: 'oklch(0.15 0 0)',
    bg: 'oklch(0.72 0.12 250)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },

  // ============================================
  // Dark mode chart fixes
  // ============================================
  {
    label: 'chart-4 on card (dark)',
    fg: 'oklch(0.55 0.20 264.38)',
    bg: 'oklch(0.12 0 0)',
    threshold: '3:1 (AA large/non-text)',
    mode: 'dark',
  },
  {
    label: 'chart-5 on card (dark)',
    fg: 'oklch(0.50 0.16 265.64)',
    bg: 'oklch(0.12 0 0)',
    threshold: '3:1 (AA large/non-text)',
    mode: 'dark',
  },

  // ============================================
  // Unchanged values (regression check)
  // ============================================
  {
    label: 'white on primary (light, unchanged)',
    fg: 'oklch(1 0 0)',
    bg: 'oklch(0.45 0.14 259.8145)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'white on primary (dark, unchanged)',
    fg: 'oklch(1 0 0)',
    bg: 'oklch(0.5 0.188 259.8145)',
    threshold: '4.5:1 (AA text)',
    mode: 'dark',
  },
  {
    label: 'foreground on bg (light, unchanged)',
    fg: 'oklch(0.25 0 0)',
    bg: 'oklch(0.99 0 0)',
    threshold: '4.5:1 (AA text)',
    mode: 'light',
  },
  {
    label: 'foreground on bg (dark, unchanged)',
    fg: 'oklch(0.9219 0 0)',
    bg: 'oklch(0.24 0 0)',
    threshold: '4.5:1 (AA text)',
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

runAudit('CURRENT VALUES (Before)', CURRENT);
const proposedFails = runAudit('PROPOSED VALUES (After)', PROPOSED);

console.log('\n' + '='.repeat(60));
if (proposedFails === 0) {
  console.log('  🎉 All proposed values PASS WCAG 2.1 AA!');
} else {
  console.log(`  ⚠️  ${proposedFails} proposed value(s) still FAIL - adjustment needed`);
}
console.log('='.repeat(60));

process.exit(proposedFails > 0 ? 1 : 0);
