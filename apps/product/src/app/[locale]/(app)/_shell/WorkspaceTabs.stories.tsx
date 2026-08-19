import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { WorkspaceTabs } from './WorkspaceTabs';

const meta = {
  title: 'Product/Components/Shell/WorkspaceTabs',
  component: WorkspaceTabs,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof WorkspaceTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** /calendar が選択中。 */
export const CalendarActive: Story = {
  render: () => (
    <div className="w-64">
      <WorkspaceTabs />
    </div>
  ),
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/calendar' } },
  },
};

/** /report が選択中。 */
export const ReportActive: Story = {
  render: () => (
    <div className="w-64">
      <WorkspaceTabs />
    </div>
  ),
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/report' } },
  },
};
