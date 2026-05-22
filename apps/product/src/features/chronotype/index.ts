/**
 * Chronotype Feature - Public API
 *
 * この barrel export は外部から参照される公開インターフェースを定義する。
 * 内部モジュールへの直接参照（deep import）は避け、ここからのみ import すること。
 */

// --- Types ---
export type { ChronotypeType } from '@/lib/types/chronotype';

// --- Components ---
export { ChronotypeQuiz } from './components/chronotype-quiz';
export { ChronotypeSettings as ChronotypeSettingsPanel } from './components/chronotype-settings';

// --- Constants ---
export { CHRONOTYPE_EMOJI, CHRONOTYPE_SELECTABLE_TYPES } from './lib/constants';

// --- Hooks ---
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
