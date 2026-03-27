import type { ProductivityZone } from '@/types/chronotype';

// ============================================
// Chronotype Gradient Generator
//
// oklch ベースの CSS linear-gradient を生成。
// peak(H70 暖色) / dip(H250 寒色) のみ色を付け、
// それ以外は bg-background のまま。
// 境界は smoothstep (r=1.4h) で滑らかに遷移。
// ============================================

/** テーマモード別の bg-background 明度 */
const BG_LIGHTNESS = { light: 0.98, dark: 0.18 } as const;

/** peak/dip の oklch パラメータ（bg-background からのオフセット） */
const ZONE_PARAMS = {
  peak: { deltaL: 0.015, chroma: 0.015, hue: 70 },
  dip: { deltaL: 0.015, chroma: 0.015, hue: 250 },
} as const;

/** smoothstep 遷移の半幅（hours） */
const SMOOTHSTEP_RADIUS = 1.4;

/** サンプリング間隔（hours） */
const SAMPLE_INTERVAL = 5 / 60; // 5分

/**
 * smoothstep: 3次エルミート補間
 * edge0 → edge1 の間を [0, 1] で滑らかに遷移
 */
function smoothstep(x: number, edge0: number, edge1: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

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

/**
 * 指定時刻における色の強度を計算（0 = neutral, 1 = full zone color）
 * 複数ゾーンの smoothstep を合成
 */
function getIntensityAt(
  hour: number,
  boundaries: Array<{ start: number; end: number; level: 'peak' | 'dip' }>,
): { intensity: number; level: 'peak' | 'dip' } | null {
  let bestIntensity = 0;
  let bestLevel: 'peak' | 'dip' = 'peak';

  for (const { start, end, level } of boundaries) {
    // ゾーンの中心部分（smoothstep で 1.0 の平坦区間）
    const fadeInStart = start - SMOOTHSTEP_RADIUS;
    const fadeInEnd = start + SMOOTHSTEP_RADIUS;
    const fadeOutStart = end - SMOOTHSTEP_RADIUS;
    const fadeOutEnd = end + SMOOTHSTEP_RADIUS;

    let intensity = 0;

    if (hour >= fadeInEnd && hour <= fadeOutStart) {
      // 完全にゾーン内
      intensity = 1;
    } else if (hour >= fadeInStart && hour < fadeInEnd) {
      // フェードイン中
      intensity = smoothstep(hour, fadeInStart, fadeInEnd);
    } else if (hour > fadeOutStart && hour <= fadeOutEnd) {
      // フェードアウト中
      intensity = 1 - smoothstep(hour, fadeOutStart, fadeOutEnd);
    }

    if (intensity > bestIntensity) {
      bestIntensity = intensity;
      bestLevel = level;
    }
  }

  if (bestIntensity <= 0) return null;
  return { intensity: bestIntensity, level: bestLevel };
}

/** oklch 値を CSS 文字列にフォーマット */
function formatOklch(l: number, c: number, h: number): string {
  return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h})`;
}

interface GradientStop {
  position: number; // 0-100 (%)
  color: string; // oklch(...)
}

/**
 * Chronotype gradient の CSS 文字列を生成
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

  const bgL = BG_LIGHTNESS[mode];
  const stops: GradientStop[] = [];

  // 24h を 5 分刻みでサンプリング
  const totalSamples = Math.ceil(24 / SAMPLE_INTERVAL);

  for (let i = 0; i <= totalSamples; i++) {
    const hour = Math.min(i * SAMPLE_INTERVAL, 24);
    const position = (hour / 24) * 100;

    const result = getIntensityAt(hour, boundaries);

    if (!result) {
      stops.push({ position, color: formatOklch(bgL, 0, 0) });
    } else {
      const params = ZONE_PARAMS[result.level];
      const l = bgL + params.deltaL * result.intensity;
      const c = params.chroma * result.intensity;
      stops.push({ position, color: formatOklch(l, c, params.hue) });
    }
  }

  // 隣接する同色 stop を間引く（始点・終点・変化点のみ残す）
  const optimized = optimizeStops(stops);

  const stopsStr = optimized.map((s) => `${s.color} ${s.position.toFixed(2)}%`).join(', ');

  return `linear-gradient(to bottom, ${stopsStr})`;
}

/** 連続する同色 stop を間引いて最適化 */
function optimizeStops(stops: GradientStop[]): GradientStop[] {
  if (stops.length <= 2) return stops;

  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return stops;

  const result: GradientStop[] = [first];

  for (let i = 1; i < stops.length - 1; i++) {
    const prev = stops[i - 1]!;
    const curr = stops[i]!;
    const next = stops[i + 1]!;

    // 前後と色が同じなら省略可能
    if (prev.color === curr.color && curr.color === next.color) {
      continue;
    }

    result.push(curr);
  }

  result.push(last);
  return result;
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
