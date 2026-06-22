import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Switch } from '@dayopt/components';
import { withWrapper } from '@dayopt/storybook/decorators';

import { LabeledRow } from './LabeledRow';

const meta = {
  title: 'Components/Common/LabeledRow',
  component: LabeledRow,
  tags: ['autodocs'],
  decorators: [withWrapper('w-[500px]')],
} satisfies Meta<typeof LabeledRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** control（デフォルト）: ラベル + Switch。 */
export const Default: Story = {
  args: {
    label: 'Notifications',
    children: <Switch aria-label="Notifications" />,
  },
};

/** ラベル + 説明文。 */
export const WithDescription: Story = {
  args: {
    label: 'Dark mode',
    description: 'Use dark theme across the app',
    children: <Switch aria-label="Dark mode" />,
  },
};

/** navigate: ChevronRight付き、行全体がタップ可能。 */
export const Navigate: Story = {
  args: {
    label: 'Change password',
    variant: 'navigate',
    onClick: () => alert('Navigate clicked'),
  },
};

/** navigate + 現在値表示。 */
export const NavigateWithValue: Story = {
  args: {
    label: 'Display name',
    variant: 'navigate',
    onClick: () => alert('Navigate clicked'),
    children: <span className="text-muted-foreground text-sm">John Doe</span>,
  },
};

/** action: destructiveカラー。 */
export const Action: Story = {
  args: {
    label: 'Delete account',
    variant: 'action',
    onClick: () => alert('Action clicked'),
  },
};

/** display: 表示のみ（操作なし）。 */
export const Display: Story = {
  args: {
    label: 'demo@dayopt.app',
    variant: 'display',
  },
};

/** 複数行を並べた設定画面パターン（全variant）。 */
export const AllVariants: StoryObj = {
  render: () => (
    <div>
      <LabeledRow label="Notifications">
        <Switch aria-label="Notifications" />
      </LabeledRow>
      <LabeledRow label="Dark mode" description="Use dark theme across the app">
        <Switch aria-label="Dark mode" />
      </LabeledRow>
      <LabeledRow label="Language">
        <span className="text-muted-foreground text-sm">English</span>
      </LabeledRow>
      <LabeledRow label="Change password" variant="navigate" onClick={() => {}} />
      <LabeledRow label="Delete account" variant="action" onClick={() => {}} />
      <LabeledRow label="demo@dayopt.app" variant="display" />
    </div>
  ),
};
