import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Button, Switch } from '@dayopt/components';
import { withWrapper } from '@dayopt/storybook/decorators';

import { LabeledRow } from './LabeledRow';
import { SectionCard } from './SectionCard';

const meta = {
  title: 'Components/UI/Display/SectionCard',
  component: SectionCard,
  tags: ['autodocs'],
  decorators: [withWrapper('w-[500px]')],
} satisfies Meta<typeof SectionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** タイトル付きセクション。 */
export const Default: Story = {
  args: {
    title: 'General',
    children: (
      <>
        <LabeledRow label="Notifications">
          <Switch aria-label="Notifications" />
        </LabeledRow>
        <LabeledRow label="Sound">
          <Switch aria-label="Sound" />
        </LabeledRow>
      </>
    ),
  },
};

/** タイトル + アクションボタン付き。 */
export const WithActions: Story = {
  args: {
    title: 'Tags',
    actions: (
      <Button variant="outline" size="sm">
        Add tag
      </Button>
    ),
    children: <div className="text-muted-foreground py-4 text-center text-sm">No tags yet</div>,
  },
};

/** タイトルなし。 */
export const WithoutTitle: Story = {
  args: {
    children: (
      <LabeledRow label="Email">
        <span className="text-muted-foreground text-sm">demo@dayopt.app</span>
      </LabeledRow>
    ),
  },
};

/** navigate variant付きセクション。 */
export const WithNavigateRows: Story = {
  args: {
    title: 'Account',
    children: (
      <>
        <LabeledRow label="demo@dayopt.app" variant="navigate" onClick={() => {}} />
        <LabeledRow label="••••••••" variant="navigate" onClick={() => {}} />
      </>
    ),
  },
};

/** 複数セクションを並べた設定画面パターン。 */
export const AllPatterns: StoryObj = {
  render: () => (
    <div className="space-y-6">
      <SectionCard title="General">
        <LabeledRow label="Notifications">
          <Switch aria-label="Notifications" />
        </LabeledRow>
        <LabeledRow label="Sound">
          <Switch aria-label="Sound" />
        </LabeledRow>
      </SectionCard>
      <SectionCard title="Account">
        <LabeledRow label="Change email" variant="navigate" onClick={() => {}} />
        <LabeledRow label="Change password" variant="navigate" onClick={() => {}} />
      </SectionCard>
      <SectionCard
        title="Tags"
        actions={
          <Button variant="outline" size="sm">
            Add tag
          </Button>
        }
      >
        <div className="text-muted-foreground py-4 text-center text-sm">No tags yet</div>
      </SectionCard>
      <SectionCard title="Danger Zone">
        <LabeledRow label="Delete account" variant="action" onClick={() => {}} />
      </SectionCard>
    </div>
  ),
};
