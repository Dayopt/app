import { fn } from 'storybook/test';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { ChronotypeStep } from './ChronotypeStep';

const defaultCardData = [
  { type: 'lion' as const, emoji: '🦁' },
  { type: 'bear' as const, emoji: '🐻' },
  { type: 'wolf' as const, emoji: '🐺' },
  { type: 'dolphin' as const, emoji: '🐬' },
];

const quizPlaceholder = (
  <div className="bg-muted rounded-lg p-8 text-center">
    <p className="text-muted-foreground text-sm">ChronotypeQuiz placeholder</p>
  </div>
);

/** ChronotypeStep - クロノタイプ選択ステップ */
const meta = {
  title: 'Features/Onboarding/ChronotypeStep',
  component: ChronotypeStep,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    cardData: defaultCardData,
    quizComponent: quizPlaceholder,
    onSelect: fn(),
    onShowQuiz: fn(),
    onComplete: fn(),
    onBack: fn(),
    onSkip: fn(),
    isCompleting: false,
  },
  decorators: [
    (Story) => (
      <div style={{ width: '100%', maxWidth: 400 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChronotypeStep>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** 未選択状態 */
export const Default: Story = {
  args: {
    selectedType: null,
    showQuiz: false,
  },
};

/** Lion選択済み */
export const WithSelection: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  args: {
    selectedType: 'lion',
    showQuiz: false,
  },
};

/** 完了処理中（ローディング状態） */
export const Completing: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  args: {
    selectedType: 'bear',
    showQuiz: false,
    isCompleting: true,
  },
};

/** クイズ表示中 */
export const QuizMode: Story = {
  args: {
    selectedType: null,
    showQuiz: true,
  },
};

/** 全パターン一覧 */
export const AllPatterns: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  args: {
    selectedType: null,
    showQuiz: false,
  },
  render: (args) => (
    <div className="flex flex-col items-start gap-8">
      <div style={{ width: '100%', maxWidth: 400 }}>
        <p className="text-muted-foreground mb-2 text-xs">未選択</p>
        <ChronotypeStep {...args} selectedType={null} showQuiz={false} />
      </div>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <p className="text-muted-foreground mb-2 text-xs">Bear選択済み</p>
        <ChronotypeStep {...args} selectedType="bear" showQuiz={false} />
      </div>
    </div>
  ),
};
