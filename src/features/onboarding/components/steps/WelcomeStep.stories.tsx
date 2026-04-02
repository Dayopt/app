import { fn } from 'storybook/test';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { WelcomeStep } from './WelcomeStep';

/** WelcomeStep - 名前入力ステップ */
const meta = {
  title: 'Features/Onboarding/WelcomeStep',
  component: WelcomeStep,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onNameChange: fn(),
    onContinue: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: '100%', maxWidth: 400 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WelcomeStep>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** 新規ユーザー（名前なし） */
export const Default: Story = {
  args: {
    displayName: '',
    hasExistingName: false,
  },
};

/** OAuth由来で名前あり */
export const WithExistingName: Story = {
  args: {
    displayName: 'John Doe',
    hasExistingName: true,
  },
};

/** 名前入力済み（Continue有効） */
export const WithInput: Story = {
  args: {
    displayName: 'Alice',
    hasExistingName: false,
  },
};

/** 全パターン一覧 */
export const AllPatterns: Story = {
  args: {
    displayName: '',
    hasExistingName: false,
  },
  render: (args) => (
    <div className="flex flex-col items-start gap-8">
      <div style={{ width: '100%', maxWidth: 400 }}>
        <p className="text-muted-foreground mb-2 text-xs">新規ユーザー</p>
        <WelcomeStep {...args} displayName="" hasExistingName={false} />
      </div>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <p className="text-muted-foreground mb-2 text-xs">OAuth由来</p>
        <WelcomeStep {...args} displayName="John Doe" hasExistingName={true} />
      </div>
    </div>
  ),
};
