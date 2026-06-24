import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Checkbox, Label } from '@dayopt/components';

// カスタムカラー demo 用のタグトークン（foundations の --tag-* を直接参照）
const greenCssVar = 'var(--tag-green)';

const meta = {
  title: 'Shared/Components/Inputs/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    checked: {
      control: 'boolean',
      description: 'チェック状態',
    },
    disabled: {
      control: 'boolean',
      description: '無効状態',
    },
  },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    checked: false,
    'aria-label': 'Example checkbox',
  },
};

export const Checked: Story = {
  args: {
    checked: true,
    'aria-label': 'Example checkbox',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    'aria-label': 'Disabled checkbox',
  },
};

export const Indeterminate: Story = {
  args: {
    checked: 'indeterminate',
  },
  render: (args) => (
    <div className="flex items-center gap-2">
      <Checkbox {...args} id="indeterminate" />
      <Label htmlFor="indeterminate">一部選択（indeterminate）</Label>
    </div>
  ),
};

export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms">利用規約に同意する</Label>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // チェックボックスをクリックしてチェック状態にする
    const checkbox = canvas.getByRole('checkbox');
    await expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    await expect(checkbox).toBeChecked();

    // もう一度クリックしてチェック解除
    await userEvent.click(checkbox);
    await expect(checkbox).not.toBeChecked();
  },
};

export const WithCustomColor: Story = {
  render: function CustomColorCheckbox() {
    const [checked, setChecked] = useState(true);

    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id="tag-filter"
          checked={checked}
          onCheckedChange={(c) => setChecked(c === true)}
          style={{
            borderColor: greenCssVar,
            backgroundColor: checked ? greenCssVar : 'transparent',
          }}
        />
        <Label htmlFor="tag-filter">タグフィルター（カスタムカラー）</Label>
      </div>
    );
  },
};

export const AllPatterns: Story = {
  render: function AllPatternsStory() {
    const [checked1, setChecked1] = useState(false);
    const [checked2, setChecked2] = useState(true);

    return (
      <div className="flex flex-col items-start gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="cb1"
              checked={checked1}
              onCheckedChange={(c) => setChecked1(c === true)}
            />
            <Label htmlFor="cb1">未チェック</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="cb2"
              checked={checked2}
              onCheckedChange={(c) => setChecked2(c === true)}
            />
            <Label htmlFor="cb2">チェック済み</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="cb-indeterminate" checked="indeterminate" />
            <Label htmlFor="cb-indeterminate">一部選択（indeterminate）</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="cb3" disabled />
            <Label htmlFor="cb3" className="text-muted-foreground">
              無効
            </Label>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="tag"
            checked={checked2}
            onCheckedChange={(c) => setChecked2(c === true)}
            style={{
              borderColor: greenCssVar,
              backgroundColor: checked2 ? greenCssVar : 'transparent',
            }}
          />
          <Label htmlFor="tag">仕事</Label>
        </div>
      </div>
    );
  },
};
