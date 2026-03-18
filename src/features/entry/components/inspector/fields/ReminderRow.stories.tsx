import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { ReminderRow } from './ReminderRow';

/**
 * ReminderRow — リマインダー設定行
 *
 * icon + ラベル（左）| ReminderSelect（右）の構成。
 * リマインダーなし・5分前・10分前・15分前・30分前・1時間前などをサポートする。
 */
const meta = {
  title: 'Features/Entry/Inspector/ReminderRow',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ReminderRowDemo({ initialValue = null }: { initialValue?: number | null }) {
  const [value, setValue] = useState<number | null>(initialValue);
  return (
    <div className="w-72">
      <ReminderRow value={value} onChange={setValue} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** リマインダーなし（デフォルト）。「追加」テキストが表示される。 */
export const Default: Story = {
  render: () => <ReminderRowDemo />,
};

/** 5分前。 */
export const FiveMinutes: Story = {
  render: () => <ReminderRowDemo initialValue={5} />,
};

/** 10分前。 */
export const TenMinutes: Story = {
  render: () => <ReminderRowDemo initialValue={10} />,
};

/** 15分前。 */
export const FifteenMinutes: Story = {
  render: () => <ReminderRowDemo initialValue={15} />,
};

/** 30分前。 */
export const ThirtyMinutes: Story = {
  render: () => <ReminderRowDemo initialValue={30} />,
};

/** 1時間前（60分）。 */
export const OneHour: Story = {
  render: () => <ReminderRowDemo initialValue={60} />,
};

/** コールバックのみ（非インタラクティブ確認用）。 */
export const WithCallbacks: Story = {
  render: () => (
    <div className="w-72">
      <ReminderRow value={null} onChange={fn()} />
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-6">
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium">なし（デフォルト）</p>
        <ReminderRowDemo />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium">5分前</p>
        <ReminderRowDemo initialValue={5} />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium">15分前</p>
        <ReminderRowDemo initialValue={15} />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium">30分前</p>
        <ReminderRowDemo initialValue={30} />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium">1時間前</p>
        <ReminderRowDemo initialValue={60} />
      </div>
    </div>
  ),
};
