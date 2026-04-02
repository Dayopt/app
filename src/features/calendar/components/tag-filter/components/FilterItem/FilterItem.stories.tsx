import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { FilterItem } from './FilterItem';

/**
 * フィルターリストの個別タグ行コンポーネント。
 * チェックボックス・タグ色・ラベル・件数・コンテキストメニュートリガーを含む。
 * チェック/未チェック・各カラーバリアント・無効状態に対応。
 */
const meta = {
  title: 'Features/Calendar/Sidebar/TagFilter/FilterItem',
  component: FilterItem,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    // aria-required-children: Radix Checkbox internal structure
    a11y: { test: 'todo' },
  },
  args: {
    label: '仕事',
    tagId: 'tag-1',
    checkboxColor: 'blue',
    checked: true,
    onCheckedChange: fn(),
    onDeleteTag: fn(),
    onShowOnlyThis: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-56">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FilterItem>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** チェック済み（表示中）。 */
export const Checked: Story = {
  args: {
    checked: true,
    label: '仕事',
    checkboxColor: 'blue',
  },
};

/** 未チェック（非表示中）。 */
export const Unchecked: Story = {
  args: {
    checked: false,
    label: '仕事',
    checkboxColor: 'blue',
  },
};

/** エントリ件数あり。右端に件数が表示される。 */
export const WithCount: Story = {
  args: {
    checked: true,
    label: '仕事',
    checkboxColor: 'blue',
    count: 12,
  },
};

/** 無効状態。クリック不可・薄表示。 */
export const Disabled: Story = {
  args: {
    checked: false,
    label: '無効タグ',
    checkboxColor: 'gray',
    disabled: true,
    disabledReason: 'このタグは現在無効です',
  },
};

/** タグIDなし（タグなしエントリ用）。コンテキストメニューが簡略版になる。 */
export const Untagged: Story = {
  render: () => (
    <div className="w-56">
      <FilterItem label="タグなし" checked={true} onCheckedChange={fn()} onShowOnlyThis={fn()} />
    </div>
  ),
};

/** インタラクティブ版（チェック切り替え可能）。 */
export const Interactive: Story = {
  render: () => {
    function InteractiveFilterItem() {
      const [checked, setChecked] = useState(true);
      return (
        <div className="w-56">
          <FilterItem
            label="仕事"
            tagId="tag-1"
            checkboxColor="blue"
            checked={checked}
            onCheckedChange={() => setChecked((prev) => !prev)}
            count={8}
            onDeleteTag={fn()}
            onShowOnlyThis={fn()}
          />
        </div>
      );
    }
    return <InteractiveFilterItem />;
  },
};

/** 全カラーバリアント。 */
export const ColorVariants: Story = {
  render: () => {
    const colors = [
      'red',
      'orange',
      'amber',
      'yellow',
      'lime',
      'green',
      'emerald',
      'teal',
      'cyan',
      'sky',
      'blue',
      'indigo',
      'violet',
      'purple',
      'fuchsia',
      'pink',
      'rose',
    ] as const;

    return (
      <div className="w-56 space-y-1">
        {colors.map((color) => (
          <FilterItem
            key={color}
            label={color}
            tagId={`tag-${color}`}
            checkboxColor={color}
            checked={true}
            onCheckedChange={fn()}
            onDeleteTag={fn()}
          />
        ))}
      </div>
    );
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="w-56 space-y-4">
      <div className="space-y-1">
        <p className="text-muted-foreground px-1 text-xs">チェック済み</p>
        <FilterItem
          label="仕事"
          tagId="tag-1"
          checkboxColor="blue"
          checked={true}
          onCheckedChange={fn()}
          count={10}
          onDeleteTag={fn()}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground px-1 text-xs">未チェック</p>
        <FilterItem
          label="勉強"
          tagId="tag-2"
          checkboxColor="green"
          checked={false}
          onCheckedChange={fn()}
          count={3}
          onDeleteTag={fn()}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground px-1 text-xs">件数なし</p>
        <FilterItem
          label="運動"
          tagId="tag-3"
          checkboxColor="amber"
          checked={true}
          onCheckedChange={fn()}
          onDeleteTag={fn()}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground px-1 text-xs">タグなし</p>
        <FilterItem label="タグなし" checked={true} onCheckedChange={fn()} onShowOnlyThis={fn()} />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground px-1 text-xs">無効状態</p>
        <FilterItem
          label="無効タグ"
          tagId="tag-4"
          checkboxColor="gray"
          checked={false}
          onCheckedChange={fn()}
          disabled={true}
          disabledReason="このタグは現在無効です"
        />
      </div>
    </div>
  ),
};
