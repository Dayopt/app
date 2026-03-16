import { CHRONOTYPE_PRESETS } from './constants';

import type {
  ChronotypeProfile,
  ChronotypeSettings,
  ChronotypeType,
  ProductivityZone,
} from '@/types/chronotype';

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

export function getEnabledChronotypeProfile(
  settings: Pick<ChronotypeSettings, 'enabled' | 'type' | 'customZones'>,
): ChronotypeProfile | null {
  if (!settings.enabled) {
    return null;
  }

  return getChronotypeProfile(settings.type, settings.customZones);
}

export function getPresetChronotypeProfile(type: ChronotypeType): ChronotypeProfile | null {
  if (type === 'custom') {
    return null;
  }

  return CHRONOTYPE_PRESETS[type];
}

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

export function getPeakHours(zones: ProductivityZone[]): string {
  const peakZone = zones.find((zone) => zone.level === 'peak');
  if (!peakZone) {
    return '-';
  }

  const formatHour = (hour: number) => `${hour}:00`;
  return `${formatHour(peakZone.startHour)} - ${formatHour(peakZone.endHour)}`;
}
