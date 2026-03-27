import type { ProductivityZone } from '@/types/chronotype';

// ============================================
// Chronotype Gradient Generator
//
// oklch ベースの CSS linear-gradient を生成。
// peak(H70 暖色) / dip(H250 寒色) のみ色を付け、
// それ以外は bg-background のまま。
// 境界: smoothstep + flat top（ゾーン内均一、端 0.8h でフェード）
// ============================================

/** テーマモード別の bg-background */
const BG = {
  light: { l: 0.98, c: 0, h: 0 },
  dark: { l: 0.18, c: 0, h: 0 },
} as const;

/**
 * peak/dip の oklch パラメータ（モード別）
 *
 * 仕様の energy=1 時の値:
 *   Light: L = 0.98 - 0.025 = 0.955, C = 0.008
 *   Dark:  L = 0.18 + 0.03  = 0.210, C = 0.008 + 0.010 = 0.018
 */
const ZONE_COLORS = {
  peak: {
    light: { l: 0.955, c: 0.008, h: 70 },
    dark: { l: 0.21, c: 0.018, h: 70 },
  },
  dip: {
    light: { l: 0.955, c: 0.008, h: 250 },
    dark: { l: 0.21, c: 0.018, h: 250 },
  },
} as const;

/** ゾーン配列から peak/dip の境界時刻リストを構築 */
function buildZoneBoundaries(zones: ProductivityZone[]): Array<{
  start: number;
  end: number;
  level: 'peak' | 'dip';
}> {
  return zones
    .filter(
      (z): z is ProductivityZone & { level: 'peak' | 'dip' } =>
        z.level === 'peak' || z.level === 'dip',
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

/** oklch 値の線形補間 */
function lerpOklch(
  a: { l: number; c: number; h: number },
  b: { l: number; c: number; h: number },
  t: number,
): { l: number; c: number; h: number } {
  return {
    l: a.l + (b.l - a.l) * t,
    c: a.c + (b.c - a.c) * t,
    h: a.h + (b.h - a.h) * t,
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
  // 境界: ハードエッジ（bg → 薄い zone色）、内側で smoothstep（薄 → 濃）
  for (const b of boundaries) {
    const zc = ZONE_COLORS[b.level][mode];
    const duration = b.end - b.start;
    const r = Math.min(FADE_RADIUS, duration / 2);

    // 開始境界: bg → zone色（ハードエッジ）
    stops.push({
      position: (b.start / 24) * 100,
      color: formatOklch(bg.l, bg.c, bg.h),
    });

    // fade-in: 薄い zone色 → 濃い zone色（start → start+r）
    for (let i = 0; i <= FADE_STEPS; i++) {
      const t = i / FADE_STEPS;
      const hour = b.start + t * r;
      const blend = EDGE_MIN + (1 - EDGE_MIN) * smoothstep(t);
      const color = lerpOklch(bg, zc, blend);
      stops.push({
        position: (hour / 24) * 100,
        color: formatOklch(color.l, color.c, color.h),
      });
    }

    // flat top: zone色均一（start+r → end-r）
    if (b.end - r > b.start + r) {
      stops.push({
        position: ((b.end - r) / 24) * 100,
        color: formatOklch(zc.l, zc.c, zc.h),
      });
    }

    // fade-out: 濃い zone色 → 薄い zone色（end-r → end）
    for (let i = 0; i <= FADE_STEPS; i++) {
      const t = i / FADE_STEPS;
      const hour = b.end - r + t * r;
      const blend = 1 - (1 - EDGE_MIN) * smoothstep(t);
      const color = lerpOklch(bg, zc, blend);
      stops.push({
        position: (hour / 24) * 100,
        color: formatOklch(color.l, color.c, color.h),
      });
    }

    // 終了境界: zone色 → bg（ハードエッジ）
    stops.push({
      position: (b.end / 24) * 100,
      color: formatOklch(bg.l, bg.c, bg.h),
    });
  }

  // 24h → bg
  stops.push({ position: 100, color: formatOklch(bg.l, bg.c, bg.h) });

  // 位置順にソートして重複を除去
  stops.sort((a, b) => a.position - b.position);

  const stopsStr = stops.map((s) => `${s.color} ${s.position.toFixed(2)}%`).join(', ');

  return `linear-gradient(to bottom, ${stopsStr})`;
}

/**
 * 指定時刻が peak/dip ゾーン内かどうかを判定
 * Now Line バッジ表示用
 */
export function getActiveZoneLevel(zones: ProductivityZone[], hour: number): 'peak' | 'dip' | null {
  const zone = zones.find((z) => {
    if (z.startHour <= z.endHour) {
      return hour >= z.startHour && hour < z.endHour;
    }
    return hour >= z.startHour || hour < z.endHour;
  });

  if (!zone) return null;
  if (zone.level === 'peak' || zone.level === 'dip') return zone.level;
  return null;
}
