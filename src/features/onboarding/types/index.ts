/** オンボーディングのステップ識別子 */
export type OnboardingStep = 'welcome' | 'chronotype';

/** オンボーディングのステップ順序配列 */
export const ONBOARDING_STEPS: OnboardingStep[] = ['welcome', 'chronotype'];

/** オンボーディングの総ステップ数 */
export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length;
