export const chronotypeTypes = ['lion', 'bear', 'wolf', 'dolphin'] as const;
export const productivityLevels = ['warmup', 'deep', 'ease', 'recovery', 'winddown'] as const;

export type ChronotypeType = (typeof chronotypeTypes)[number];

export type PresetChronotypeType = ChronotypeType;

export type ProductivityLevel = (typeof productivityLevels)[number];

export type ProductivityZone = Readonly<{
  startHour: number;
  endHour: number;
  level: ProductivityLevel;
  label: string;
}>;

export type ChronotypeProfile = Readonly<{
  type: ChronotypeType;
  name: string;
  description: string;
  productivityZones: readonly ProductivityZone[];
}>;

export type ChronotypeSettings = Readonly<{
  type: ChronotypeType;
}>;

export function isChronotypeType(value: string): value is ChronotypeType {
  return chronotypeTypes.includes(value as ChronotypeType);
}

export function isProductivityLevel(value: string): value is ProductivityLevel {
  return productivityLevels.includes(value as ProductivityLevel);
}
