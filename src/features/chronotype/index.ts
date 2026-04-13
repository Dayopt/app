/**
 * Chronotype Feature - Public API
 *
 * この barrel export は外部から参照される公開インターフェースを定義する。
 * 内部モジュールへの直接参照（deep import）は避け、ここからのみ import すること。
 */

// --- Types ---
export type {
  ChronotypeSettings,
  ChronotypeType,
  PresetChronotypeType,
  ProductivityZone,
} from '@/lib/types/chronotype';

// --- Components ---
export { ChronotypeQuiz } from './components/chronotype-quiz';
export { ChronotypeSettings as ChronotypeSettingsPanel } from './components/chronotype-settings';

// --- Constants ---
export { CHRONOTYPE_EMOJI, CHRONOTYPE_SELECTABLE_TYPES } from './lib/constants';

// --- Lib ---
export {
  getChronotypeProfile,
  getDeepHours,
  getEaseHours,
  getProductivityZoneForHour,
} from './lib/chronotype-profile';
export { generateChronotypeGradient, getActiveZoneLevel } from './lib/gradient';
export { chronotypeCustomZonesSchema, chronotypeTypeSchema } from './lib/schemas';

// ここにないものはfeature内部専用
