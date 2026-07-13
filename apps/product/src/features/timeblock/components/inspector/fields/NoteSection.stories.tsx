import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StickyNote } from 'lucide-react';

import { NoteSection } from './NoteSection';

const meta = {
  title: 'Product/Features/Timeblock/Inspector/NoteSection',
  component: NoteSection,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof NoteSection>;

export default meta;
type Story = StoryObj<typeof meta>;

function NoteSectionDemo({
  initialNote = '',
  disabled = false,
}: {
  initialNote?: string | undefined;
  disabled?: boolean | undefined;
}) {
  const [note, setNote] = useState(initialNote);
  return (
    <div className="w-80">
      <NoteSection
        label="メモ"
        icon={StickyNote}
        note={note}
        onNoteChange={setNote}
        placeholder="メモを入力..."
        disabled={disabled}
      />
    </div>
  );
}

/** 空のメモ入力欄。 */
export const Default: Story = {
  args: { label: 'メモ', note: '', onNoteChange: () => undefined },
  render: () => <NoteSectionDemo />,
};

/** 入力済みのメモ。 */
export const WithNote: Story = {
  args: { label: 'メモ', note: '', onNoteChange: () => undefined },
  render: () => <NoteSectionDemo initialNote="設計レビューで確認した内容を整理する。" />,
};

/** 編集できないメモ。 */
export const Disabled: Story = {
  args: { label: 'メモ', note: '', onNoteChange: () => undefined },
  render: () => <NoteSectionDemo initialNote="変更できないメモ" disabled />,
};

/** 主要状態の一覧。 */
export const AllPatterns: Story = {
  args: { label: 'メモ', note: '', onNoteChange: () => undefined },
  render: () => (
    <div className="flex flex-col gap-8">
      <NoteSectionDemo />
      <NoteSectionDemo initialNote="設計レビューで確認した内容を整理する。" />
      <NoteSectionDemo initialNote="変更できないメモ" disabled />
    </div>
  ),
};
