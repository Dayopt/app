import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Label } from './label';
import { Switch } from './switch';

/** Switch - トグルスイッチ（ON/OFF切替）。即座に反映される設定に使用、フォーム送信後に反映する場合はCheckboxを使用。 */
const meta = {
  title: 'Components/UI/Switch',
  component: Switch,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    checked: {
      control: 'boolean',
      description: 'スイッチの状態',
    },
    disabled: {
      control: 'boolean',
      description: '無効状態',
    },
  },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function DefaultSwitch() {
    const [checked, setChecked] = useState(false);
    return <Switch checked={checked} onCheckedChange={setChecked} aria-label="Toggle switch" />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // スイッチをクリックしてONにする
    const switchElement = canvas.getByRole('switch');
    await expect(switchElement).not.toBeChecked();
    await userEvent.click(switchElement);
    await expect(switchElement).toBeChecked();

    // もう一度クリックしてOFFにする
    await userEvent.click(switchElement);
    await expect(switchElement).not.toBeChecked();
  },
};

export const Checked: Story = {
  render: function CheckedSwitch() {
    const [checked, setChecked] = useState(true);
    return <Switch checked={checked} onCheckedChange={setChecked} aria-label="Toggle switch" />;
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    'aria-label': 'Disabled switch',
  },
};

export const WithLabel: Story = {
  render: function SwitchWithLabel() {
    const [enabled, setEnabled] = useState(false);
    return (
      <div className="flex w-64 items-center justify-between">
        <Label htmlFor="sleep-mode">おやすみモード</Label>
        <Switch id="sleep-mode" checked={enabled} onCheckedChange={setEnabled} />
      </div>
    );
  },
};

export const AllPatterns: Story = {
  render: function AllPatternsStory() {
    const [sleepEnabled, setSleepEnabled] = useState(true);
    const [syncEnabled, setSyncEnabled] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleSyncChange = async (checked: boolean) => {
      setIsLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 500));
      setSyncEnabled(checked);
      setIsLoading(false);
    };

    return (
      <div className="flex flex-col items-start gap-6">
        <div className="border-border divide-border divide-y rounded-lg border">
          <div className="flex items-center justify-between px-4 py-4">
            <Label htmlFor="sleep">おやすみモード</Label>
            <Switch id="sleep" checked={sleepEnabled} onCheckedChange={setSleepEnabled} />
          </div>
          <div className="flex items-center justify-between px-4 py-4">
            <Label htmlFor="sync">カレンダー同期</Label>
            <Switch
              id="sync"
              checked={syncEnabled}
              onCheckedChange={handleSyncChange}
              disabled={isLoading}
            />
          </div>
          <div className="flex items-center justify-between px-4 py-4">
            <Label htmlFor="disabled" className="text-muted-foreground">
              無効な設定
            </Label>
            <Switch id="disabled" disabled />
          </div>
        </div>
      </div>
    );
  },
};
