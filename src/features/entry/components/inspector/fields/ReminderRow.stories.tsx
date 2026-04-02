import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { ReminderRow } from './ReminderRow';

/**
 * ReminderRow — 開始時通知設定行
 *
 * icon + ラベル（左）| ReminderToggle（右）の構成。
 * ON（開始時に通知）/ OFF（通知なし）の2択。
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

function ReminderRowDemo({ initialValue = null }: { initialValue?: number | null }) {
  const [value, setValue] = useState<number | null>(initialValue);
  return (
    <div className="w-72">
      <ReminderRow value={value} onChange={setValue} />
    </div>
  );
}

/** 開始時通知OFF（デフォルト） */
export const Default: Story = {
  render: () => <ReminderRowDemo />,
};

/** 開始時通知ON */
export const Enabled: Story = {
  render: () => <ReminderRowDemo initialValue={0} />,
};

/** コールバックのみ（非インタラクティブ確認用） */
export const WithCallbacks: Story = {
  render: () => (
    <div className="w-72">
      <ReminderRow value={null} onChange={fn()} />
    </div>
  ),
};

/** ON/OFF 一覧 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-6">
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">OFF（デフォルト）</p>
        <ReminderRowDemo />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">ON（開始時に通知）</p>
        <ReminderRowDemo initialValue={0} />
      </div>
    </div>
  ),
};
