import type { ProductivityZone } from '@/types/chronotype';

// ============================================
// Chronotype Gradient Generator
//
// oklch ベースの CSS linear-gradient を生成。
// deep(H70 暖色) / ease(H150 寒色) のみ色を付け、
// ゾーン外は transparent（bg-background をそのまま透過）。
// 境界: smoothstep + flat top（ゾーン内均一、端 0.8h でフェード）
// ============================================

/**
 * deep/ease の oklch パラメータ（モード別）
 *
 * 仕様の energy=1 時の値:
 *   Light: L = 0.955, C = 0.008
 *   Dark:  L = 0.210, C = 0.018
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

/** oklch + alpha を CSS 文字列にフォーマット */
function formatOklchAlpha(l: number, c: number, h: number, alpha: number): string {
  if (alpha <= 0) return 'transparent';
  if (alpha >= 1) return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h})`;
  return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h} / ${alpha.toFixed(3)})`;
}

/** smoothstep: 3t² − 2t³ */
function smoothstep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/** フェード区間の半径（時間単位） */
const FADE_RADIUS = 0.8;

/** フェード区間あたりのストップ数 */
const FADE_STEPS = 5;

interface GradientStop {
  position: number; // 0-100 (%)
  color: string; // oklch(...) or transparent
}

/**
 * Chronotype gradient の CSS 文字列を生成
 *
 * Smoothstep + Flat top: ゾーン内は均一の濃さ、端 0.8h でフェード。
 * ゾーン外は transparent で bg-background を透過させる。
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

  const stops: GradientStop[] = [];

  // 0h → transparent
  stops.push({ position: 0, color: 'transparent' });

  // 各ゾーンの fade-in → flat → fade-out ストップを生成
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

    // fade-in: transparent → zone色（start-rIn → start）
    for (let i = 0; i <= FADE_STEPS; i++) {
      const t = i / FADE_STEPS;
      const hour = b.start - rIn + t * rIn;
      const alpha = smoothstep(t);
      stops.push({
        position: (hour / 24) * 100,
        color: formatOklchAlpha(zc.l, zc.c, zc.h, alpha),
      });
    }

    // flat top: zone色均一（start → end）
    stops.push({
      position: (b.start / 24) * 100,
      color: formatOklchAlpha(zc.l, zc.c, zc.h, 1),
    });
    if (b.end > b.start) {
      stops.push({
        position: (b.end / 24) * 100,
        color: formatOklchAlpha(zc.l, zc.c, zc.h, 1),
      });
    }

    // fade-out: zone色 → transparent（end → end+rOut）
    for (let i = 0; i <= FADE_STEPS; i++) {
      const t = i / FADE_STEPS;
      const hour = b.end + t * rOut;
      const alpha = 1 - smoothstep(t);
      stops.push({
        position: (hour / 24) * 100,
        color: formatOklchAlpha(zc.l, zc.c, zc.h, alpha),
      });
    }
  }

  // 24h → transparent
  stops.push({ position: 100, color: 'transparent' });

  // 位置順にソート
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
