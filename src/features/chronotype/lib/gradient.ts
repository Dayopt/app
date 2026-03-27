import type { ProductivityZone } from '@/types/chronotype';

// ============================================
// Chronotype Gradient Generator
//
// oklch ベースの CSS linear-gradient を生成。
// deep(H70 暖色) / ease(H250 寒色) のみ色を付け、
// それ以外は bg-background のまま。
// 境界: smoothstep + flat top（ゾーン内均一、端 0.8h でフェード）
// ============================================

/** テーマモード別の bg-background */
const BG = {
  light: { l: 0.98, c: 0, h: 0 },
  dark: { l: 0.18, c: 0, h: 0 },
} as const;

/**
 * deep/ease の oklch パラメータ（モード別）
 *
 * 仕様の energy=1 時の値:
 *   Light: L = 0.98 - 0.025 = 0.955, C = 0.008
 *   Dark:  L = 0.18 + 0.03  = 0.210, C = 0.008 + 0.010 = 0.018
 */
const ZONE_COLORS = {
  deep: {
    light: { l: 0.955, c: 0.008, h: 70 },
    dark: { l: 0.21, c: 0.018, h: 70 },
  },
  ease: {
    light: { l: 0.955, c: 0.008, h: 150 },
    dark: { l: 0.21, c: 0.018, h: 150 },
  },
} as const;

/** ゾーン配列から deep/ease の境界時刻リストを構築 */
function buildZoneBoundaries(zones: ProductivityZone[]): Array<{
  start: number;
  end: number;
  level: 'deep' | 'ease';
}> {
  return zones
    .filter(
      (z): z is ProductivityZone & { level: 'deep' | 'ease' } =>
        z.level === 'deep' || z.level === 'ease',
    )
    .map((z) => ({ start: z.startHour, end: z.endHour, level: z.level }));
}

/** oklch 値を CSS 文字列にフォーマット */
function formatOklch(l: number, c: number, h: number): string {
  return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h})`;
}

/** smoothstep: 3t² − 2t³ */
function smoothstep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/** oklch 値の線形補間（achromatic の hue は相手に合わせる） */
function lerpOklch(
  a: { l: number; c: number; h: number },
  b: { l: number; c: number; h: number },
  t: number,
): { l: number; c: number; h: number } {
  // chroma=0 は achromatic（hue 無意味）→ 相手の hue を使う
  const hA = a.c < 0.001 ? b.h : a.h;
  const hB = b.c < 0.001 ? a.h : b.h;
  return {
    l: a.l + (b.l - a.l) * t,
    c: a.c + (b.c - a.c) * t,
    h: hA + (hB - hA) * t,
  };
}

/** フェード区間の半径（時間単位） */
const FADE_RADIUS = 0.8;

/** フェード区間あたりのストップ数 */
const FADE_STEPS = 5;

interface GradientStop {
  position: number; // 0-100 (%)
  color: string; // oklch(...)
}

/**
 * Chronotype gradient の CSS 文字列を生成
 *
 * Smoothstep + Flat top: ゾーン内は均一の濃さ、端 0.8h でフェード。
 *
 * @param zones - 生産性ゾーン配列
 * @param mode - 'light' | 'dark'
 * @returns CSS linear-gradient 文字列（`linear-gradient(to bottom, ...)`）
 */
export function generateChronotypeGradient(
  zones: ProductivityZone[],
  mode: 'light' | 'dark',
): string {
  const boundaries = buildZoneBoundaries(zones);
  if (boundaries.length === 0) {
    return 'none';
  }

  const bg = BG[mode];
  const stops: GradientStop[] = [];

  // 0h → bg
  stops.push({ position: 0, color: formatOklch(bg.l, bg.c, bg.h) });

  // 各ゾーンの fade-in → flat → fade-out ストップを生成
  // Medium smoothstep: フェードはゾーン外側にはみ出す（start-r ~ start, end ~ end+r）
  // 隣のゾーンとの gap が 2r 未満ならフェード幅を gap/2 に縮小（重なり防止）
  for (let idx = 0; idx < boundaries.length; idx++) {
    const b = boundaries[idx] as (typeof boundaries)[number];
    const zc = ZONE_COLORS[b.level][mode];

    // fade-in 幅: 前のゾーンとの gap を考慮
    const prev = boundaries[idx - 1];
    const gapBefore = prev ? b.start - prev.end : b.start;
    const rIn = Math.min(FADE_RADIUS, gapBefore / 2, b.start);

    // fade-out 幅: 次のゾーンとの gap を考慮
    const next = boundaries[idx + 1];
    const gapAfter = next ? next.start - b.end : 24 - b.end;
    const rOut = Math.min(FADE_RADIUS, gapAfter / 2, 24 - b.end);

    // fade-in: bg → zone色（start-rIn → start）
    for (let i = 0; i <= FADE_STEPS; i++) {
      const t = i / FADE_STEPS;
      const hour = b.start - rIn + t * rIn;
      const s = smoothstep(t);
      const color = lerpOklch(bg, zc, s);
      stops.push({
        position: (hour / 24) * 100,
        color: formatOklch(color.l, color.c, color.h),
      });
    }

    // flat top: zone色均一（start → end、両端を明示して線形補間を防ぐ）
    stops.push({
      position: (b.start / 24) * 100,
      color: formatOklch(zc.l, zc.c, zc.h),
    });
    if (b.end > b.start) {
      stops.push({
        position: (b.end / 24) * 100,
        color: formatOklch(zc.l, zc.c, zc.h),
      });
    }

    // fade-out: zone色 → bg（end → end+rOut）
    for (let i = 0; i <= FADE_STEPS; i++) {
      const t = i / FADE_STEPS;
      const hour = b.end + t * rOut;
      const s = smoothstep(t);
      const color = lerpOklch(zc, bg, s);
      stops.push({
        position: (hour / 24) * 100,
        color: formatOklch(color.l, color.c, color.h),
      });
    }
  }

  // 24h → bg
  stops.push({ position: 100, color: formatOklch(bg.l, bg.c, bg.h) });

  // 位置順にソートして重複を除去
  stops.sort((a, b) => a.position - b.position);

  const stopsStr = stops.map((s) => `${s.color} ${s.position.toFixed(2)}%`).join(', ');

  return `linear-gradient(to bottom, ${stopsStr})`;
}

/**
 * 指定時刻が deep/ease ゾーン内かどうかを判定
 * Now Line バッジ表示用
 */
export function getActiveZoneLevel(
  zones: ProductivityZone[],
  hour: number,
): 'deep' | 'ease' | null {
  const zone = zones.find((z) => {
    if (z.startHour <= z.endHour) {
      return hour >= z.startHour && hour < z.endHour;
    }
    return hour >= z.startHour || hour < z.endHour;
  });

  if (!zone) return null;
  if (zone.level === 'deep' || zone.level === 'ease') return zone.level;
  return null;
}
