/**
 * Chronotype Feature - Public API
 *
 * この barrel export は外部から参照される公開インターフェースを定義する。
 * 内部モジュールへの直接参照（deep import）は避け、ここからのみ import すること。
 */

// --- Types ---
export { ChronotypeSettings as ChronotypeSettingsPanel } from './components/chronotype-settings';
export type { ChronotypeType } from './types/chronotype';
/** @public Referenced through the calendar grid's public type contract. */
export type { ProductivityZone } from './types/chronotype';

// --- Components ---
// --- Constants ---
// --- Hooks ---
export { useActiveZoneLevel } from './hooks/useActiveZoneLevel';
export { useChronotypeGradient } from './hooks/useChronotypeGradient';
export { useChronotypeZones } from './hooks/useChronotypeZones';

// --- Lib ---
export { getChronotypeProfile } from './lib/chronotype-profile';
export { generateChronotypeGradient, getActiveZoneLevel } from './lib/gradient';
export { chronotypeTypeSchema } from './lib/schemas';

// --- Stores ---
export { useChronotypeSettingsStore } from './stores/useChronotypeSettingsStore';
export type { ChronotypeSettings } from './stores/useChronotypeSettingsStore';

// ここにないものはfeature内部専用
