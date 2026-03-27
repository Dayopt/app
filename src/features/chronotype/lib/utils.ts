import { CHRONOTYPE_PRESETS } from './constants';

import type {
  ChronotypeProfile,
  ChronotypeSettings,
  ChronotypeType,
  ProductivityZone,
} from '@/types/chronotype';

/**
 * クロノタイプ設定からプロフィールを取得する
 * @param type - クロノタイプ種別
 * @param customZones - カスタムタイプ時の生産性ゾーン配列
 */
export function getChronotypeProfile(
  type: ChronotypeType,
  customZones?: ProductivityZone[],
): ChronotypeProfile {
  if (type === 'custom') {
    return {
      ...CHRONOTYPE_PRESETS.custom,
      productivityZones: customZones ?? [],
    };
  }

  return CHRONOTYPE_PRESETS[type];
}

/**
 * 設定からクロノタイプが有効な場合のみプロフィールを返す
 * @returns 無効な場合は null
 */
export function getEnabledChronotypeProfile(
  settings: Pick<ChronotypeSettings, 'enabled' | 'type' | 'customZones'>,
): ChronotypeProfile | null {
  if (!settings.enabled) {
    return null;
  }

  return getChronotypeProfile(settings.type, settings.customZones);
}

/**
 * プリセットクロノタイプのプロフィールを取得する（カスタムは非対応）
 * @returns custom タイプの場合は null
 */
export function getPresetChronotypeProfile(type: ChronotypeType): ChronotypeProfile | null {
  if (type === 'custom') {
    return null;
  }

  return CHRONOTYPE_PRESETS[type];
}

/**
 * 指定時間に該当する生産性ゾーンを取得する
 * @param hour - 時間（0-23）
 * @returns 該当ゾーンがない場合は null
 */
export function getProductivityZoneForHour(
  profile: ChronotypeProfile,
  hour: number,
): ProductivityZone | null {
  return (
    profile.productivityZones.find((zone) => {
      if (zone.startHour <= zone.endHour) {
        return hour >= zone.startHour && hour < zone.endHour;
      }

      return hour >= zone.startHour || hour < zone.endHour;
    }) ?? null
  );
}

/**
 * カレンダー表示範囲内に収まる生産性ゾーンをピクセル座標付きで返す
 * @param startHour - 表示開始時間
 * @param endHour - 表示終了時間
 * @param hourHeight - 1時間あたりの高さ（px）
 */
export function getVisibleProductivityZones(
  profile: ChronotypeProfile,
  startHour: number,
  endHour: number,
  hourHeight: number,
): Array<{ zone: ProductivityZone; top: number; height: number }> {
  const zones: Array<{ zone: ProductivityZone; top: number; height: number }> = [];

  for (const zone of profile.productivityZones) {
    const zoneStart = zone.startHour;
    const zoneEnd = zone.endHour;

    if (zoneStart > zoneEnd) {
      if (zoneStart < endHour) {
        const actualStart = Math.max(zoneStart, startHour);
        const actualEnd = Math.min(24, endHour);
        if (actualStart < actualEnd) {
          zones.push({
            zone,
            top: (actualStart - startHour) * hourHeight,
            height: (actualEnd - actualStart) * hourHeight,
          });
        }
      }

      if (zoneEnd > startHour) {
        const actualStart = Math.max(0, startHour);
        const actualEnd = Math.min(zoneEnd, endHour);
        if (actualStart < actualEnd) {
          zones.push({
            zone,
            top: (actualStart - startHour) * hourHeight,
            height: (actualEnd - actualStart) * hourHeight,
          });
        }
      }

      continue;
    }

    const actualStart = Math.max(zoneStart, startHour);
    const actualEnd = Math.min(zoneEnd, endHour);
    if (actualStart < actualEnd) {
      zones.push({
        zone,
        top: (actualStart - startHour) * hourHeight,
        height: (actualEnd - actualStart) * hourHeight,
      });
    }
  }

  return zones;
}

/**
 * 生産性ゾーン配列から指定レベルの時間帯を "HH:00 – HH:00" 形式で返す
 */
function getZoneHours(zones: ProductivityZone[], level: ProductivityZone['level']): string {
  const zone = zones.find((z) => z.level === level);
  if (!zone) return '-';
  return `${zone.startHour}:00 – ${zone.endHour}:00`;
}

/**
 * ピーク時間帯を返す
 * @returns ピークゾーンがない場合は '-'
 */
export function getPeakHours(zones: ProductivityZone[]): string {
  return getZoneHours(zones, 'peak');
}

/**
 * ディップ時間帯を返す
 * @returns ディップゾーンがない場合は '-'
 */
export function getDipHours(zones: ProductivityZone[]): string {
  return getZoneHours(zones, 'dip');
}
