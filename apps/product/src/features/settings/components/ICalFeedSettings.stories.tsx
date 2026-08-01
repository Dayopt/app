import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { ICalFeedSettingsView } from './ICalFeedSettings';

const BASE_ARGS = {
  feedUrl: 'https://app.dayopt.app/api/v1/calendar/example-private-token.ics',
  loading: false,
  error: false,
  regenerating: false,
  copied: false,
  onRetry: fn(),
  onCopy: fn(),
  onGenerate: fn(),
};

const meta = {
  title: 'Product/Features/Settings/ICalFeedSettings',
  component: ICalFeedSettingsView,
  args: BASE_ARGS,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ICalFeedSettingsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TokenAvailable: Story = {};

export const TokenMissing: Story = {
  args: { feedUrl: null },
};

export const Loading: Story = {
  args: { feedUrl: null, loading: true },
};

export const QueryError: Story = {
  args: { feedUrl: null, error: true },
};

export const AllPatterns: Story = {
  render: () => (
    <div className="space-y-8">
      <ICalFeedSettingsView {...BASE_ARGS} />
      <ICalFeedSettingsView {...BASE_ARGS} feedUrl={null} />
      <ICalFeedSettingsView {...BASE_ARGS} feedUrl={null} loading />
      <ICalFeedSettingsView {...BASE_ARGS} feedUrl={null} error />
    </div>
  ),
};
