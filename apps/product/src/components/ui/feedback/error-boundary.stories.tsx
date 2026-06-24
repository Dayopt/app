import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { DefaultErrorFallback, DevErrorFallback, FeatureErrorFallback } from './error-boundary';

const meta = {
  title: 'Product/Components/Feedback/ErrorBoundary',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/** デフォルトのエラーフォールバックUI。 */
export const Default: Story = {
  render: () => (
    <div className="w-[500px]">
      <DefaultErrorFallback onRetry={() => {}} onReload={() => {}} />
    </div>
  ),
};

/** 開発環境用フォールバック。 */
export const Dev: Story = {
  render: () => (
    <div className="w-[500px]">
      <DevErrorFallback componentName="CalendarView" />
    </div>
  ),
};

/** 機能エラー用フォールバック。 */
export const Feature: Story = {
  render: () => (
    <div className="w-[500px]">
      <FeatureErrorFallback featureName="stats" />
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex w-[500px] flex-col gap-6">
      <div>
        <p className="text-muted-foreground mb-2 text-xs">Default</p>
        <DefaultErrorFallback onRetry={() => {}} onReload={() => {}} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">Dev</p>
        <DevErrorFallback componentName="CalendarView" />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">Feature</p>
        <FeatureErrorFallback featureName="stats" />
      </div>
    </div>
  ),
};
