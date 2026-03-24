import { useEffect } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { useOnboardingStore } from '../stores/useOnboardingStore';

import { OnboardingWizard } from './OnboardingWizard';

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

const mockCardData = [
  { type: 'lion' as const, emoji: '🦁' },
  { type: 'bear' as const, emoji: '🐻' },
  { type: 'wolf' as const, emoji: '🐺' },
  { type: 'dolphin' as const, emoji: '🐬' },
];

const mockQuiz = (
  <div className="bg-muted rounded-lg p-8 text-center">
    <p className="text-muted-foreground text-sm">ChronotypeQuiz placeholder</p>
  </div>
);

/** Zustandストアを特定ステップにリセットするラッパー */
function StoreReset({
  step,
  children,
}: {
  step: 'welcome' | 'chronotype';
  children: React.ReactNode;
}) {
  useEffect(() => {
    useOnboardingStore.setState({
      currentStep: step,
      displayName: step === 'welcome' ? '' : 'Test User',
      chronotypeType: null,
      showQuiz: false,
    });
  }, [step]);
  return <>{children}</>;
}

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

/** OnboardingWizard - 2ステップウィザード全体 */
const meta = {
  title: 'Features/Onboarding/Wizard',
  component: OnboardingWizard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    initialName: '',
    cardData: mockCardData,
    quizComponent: mockQuiz,
    onComplete: fn(),
    isCompleting: false,
  },
  decorators: [
    (Story) => (
      <div style={{ width: '100%', maxWidth: 448 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OnboardingWizard>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** Step 1: Welcome（新規ユーザー） */
export const Step1Welcome: Story = {
  decorators: [
    (Story) => (
      <StoreReset step="welcome">
        <Story />
      </StoreReset>
    ),
  ],
};

/** Step 1: Welcome（OAuth名あり） */
export const Step1WithName: Story = {
  args: {
    initialName: 'John Doe',
  },
  decorators: [
    (Story) => (
      <StoreReset step="welcome">
        <Story />
      </StoreReset>
    ),
  ],
};

/** Step 2: Chronotype選択 */
export const Step2Chronotype: Story = {
  decorators: [
    (Story) => (
      <StoreReset step="chronotype">
        <Story />
      </StoreReset>
    ),
  ],
};

/** 全パターン一覧 */
export const AllPatterns: Story = {
  render: (args) => (
    <div className="flex flex-col items-start gap-12">
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">Step 1: Welcome</p>
        <StoreReset step="welcome">
          <OnboardingWizard {...args} />
        </StoreReset>
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">Step 2: Chronotype</p>
        <StoreReset step="chronotype">
          <OnboardingWizard {...args} />
        </StoreReset>
      </div>
    </div>
  ),
};
