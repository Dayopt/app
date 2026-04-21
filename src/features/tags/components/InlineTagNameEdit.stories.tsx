import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { InlineTagNameEdit } from './InlineTagNameEdit';

/**
 * InlineTagNameEdit — タグ名の in-place edit
 *
 * editing=false ではただの `<span>`、editing=true で `<Input>` に変化。
 * Enter / blur で保存、Esc で破棄。重複チェックは `existingNames` に基づく。
 */
const meta = {
  title: 'Features/Tags/InlineTagNameEdit',
  component: InlineTagNameEdit,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  args: {
    value: 'Work',
    existingNames: [],
    editing: false,
    onSave: () => {},
    onDoneEditing: () => {},
  },
} satisfies Meta<typeof InlineTagNameEdit>;

export default meta;
type Story = StoryObj<typeof meta>;

function HarnessHost({ initialValue, others = [] }: { initialValue: string; others?: string[] }) {
  const [value, setValue] = useState(initialValue);
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex w-64 items-center gap-2">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="border-border hover:bg-state-hover rounded-lg border px-2 py-1 text-xs"
      >
        編集
      </button>
      <span className="min-w-0 flex-1">
        <InlineTagNameEdit
          value={value}
          onSave={async (next) => setValue(next)}
          existingNames={others}
          editing={editing}
          onDoneEditing={() => setEditing(false)}
          ariaLabel={value}
        />
      </span>
    </div>
  );
}

/** 非編集状態。ボタンを押すと編集モードに入る。 */
export const IdleState: Story = {
  render: () => <HarnessHost initialValue="Work" />,
};

/** 編集モードで重複値を入力するとエラー表示。 */
export const WithDuplicateError: Story = {
  render: () => <HarnessHost initialValue="Work" others={['Study', 'Exercise']} />,
};

/** 全パターン一覧 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">非編集 → 編集切替</p>
        <HarnessHost initialValue="Work" />
      </div>
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">重複エラー</p>
        <HarnessHost initialValue="Work" others={['Study', 'Exercise']} />
      </div>
    </div>
  ),
};
