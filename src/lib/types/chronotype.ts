// Chronotype 共有型定義
// 複数feature・共有storeが参照する型をここに定義

export type ChronotypeType = 'lion' | 'bear' | 'wolf' | 'dolphin' | 'custom';

export type PresetChronotypeType = Exclude<ChronotypeType, 'custom'>;

export type ProductivityLevel = 'warmup' | 'deep' | 'ease' | 'recovery' | 'winddown';

export interface ProductivityZone {
  startHour: number;
  endHour: number;
  level: ProductivityLevel;
  label: string;
}

export interface ChronotypeProfile {
  type: ChronotypeType;
  name: string;
  description: string;
  productivityZones: ProductivityZone[];
}

export interface ChronotypeSettings {
  enabled: boolean;
  type: ChronotypeType;
  customZones?: ProductivityZone[];
}
