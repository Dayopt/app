/**
 * Onboarding Feature - Public API
 *
 * この barrel export は外部から参照される公開インターフェースを定義する。
 * 内部モジュールへの直接参照（deep import）は避け、ここからのみ import すること。
 */

// --- Components ---
export { OnboardingWizard } from './components/OnboardingWizard';
export type { QuizCallbacks } from './components/OnboardingWizard';

// --- Types ---
export { ONBOARDING_STEPS, ONBOARDING_STEP_COUNT } from './types';
export type { OnboardingStep } from './types';

// ここにないものはfeature内部専用
