import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { CalendarAnalyticsPanel } from './CalendarAnalyticsPanel';

const tags = [
  {
    id: 'tag-work',
    name: 'Work',
    user_id: 'user-1',
    color: 'blue',
    icon: 'briefcase',
    is_active: true,
    parent_id: null,
    sort_order: 0,
    created_at: null,
    updated_at: null,
  },
  {
    id: 'tag-admin',
    name: 'Admin',
    user_id: 'user-1',
    color: 'amber',
    icon: null,
    is_active: true,
    parent_id: null,
    sort_order: 1,
    created_at: null,
    updated_at: null,
  },
];

const meta = {
  title: 'Features/Calendar/Analytics/CalendarAnalyticsPanel',
  component: CalendarAnalyticsPanel,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    trpcMocks: {
      'tags.list': { data: tags },
    },
  },
} satisfies Meta<typeof CalendarAnalyticsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 全体スコープ。 */
export const Default: Story = {
  args: {
    selectedTagId: null,
    onSelectedTagIdChange: fn(),
    onClose: fn(),
    className: 'border-border-subtle h-96 w-64 border',
  },
};

/** タグスコープ。 */
export const TagSelected: Story = {
  args: {
    selectedTagId: 'tag-work',
    onSelectedTagIdChange: fn(),
    onClose: fn(),
    className: 'border-border-subtle h-96 w-64 border',
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: {
    selectedTagId: null,
    onSelectedTagIdChange: fn(),
  },
  render: () => (
    <div className="flex flex-wrap items-start gap-4">
      <CalendarAnalyticsPanel
        selectedTagId={null}
        onSelectedTagIdChange={fn()}
        onClose={fn()}
        className="border-border-subtle h-96 w-64 border"
      />
      <CalendarAnalyticsPanel
        selectedTagId="tag-work"
        onSelectedTagIdChange={fn()}
        onClose={fn()}
        className="border-border-subtle h-96 w-64 border"
      />
    </div>
  ),
};
