// Chronotype 共有型定義
// 複数feature・共有storeが参照する型をここに定義

export type ChronotypeType = 'lion' | 'bear' | 'wolf' | 'dolphin';

/** @deprecated ChronotypeType と同一。custom 廃止に伴い統合 */
export type PresetChronotypeType = ChronotypeType;

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

/** DB の chronotype_settings jsonb に対応。null = 未設定/無効。 */
export interface ChronotypeSettings {
  type: ChronotypeType;
}
