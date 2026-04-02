import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FileText } from 'lucide-react';
import { expect, within } from 'storybook/test';

import { NoteSection } from './NoteSection';

/**
 * NoteSection — メモ入力行
 *
 * ラベル + 文字数カウンター（右）+ textarea（下）の構成。
 * textarea はコンテンツに合わせて自動拡張し、max-h-20 でスクロールに切り替わる。
 * HTML文字列が入力された場合は自動的にタグを除去してプレーンテキスト表示する。
 */
const meta = {
  title: 'Features/Entry/Inspector/NoteSection',
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

function NoteSectionDemo({
  initialNote = '',
  disabled = false,
  maxLength = 1000,
  placeholder = 'メモを入力...',
}: {
  initialNote?: string;
  disabled?: boolean;
  maxLength?: number;
  placeholder?: string;
}) {
  const [note, setNote] = useState(initialNote);
  return (
    <div className="w-80">
      <NoteSection
        label="メモ"
        icon={FileText}
        note={note}
        onNoteChange={setNote}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** 空の状態。プレースホルダーとゼロカウンターが表示される。 */
export const Default: Story = {
  render: () => <NoteSectionDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
    // 文字数カウンター
    expect(canvas.getByText('0/1000')).toBeInTheDocument();
  },
};

/** テキスト入力済みの状態。文字数カウンターが更新される。 */
export const WithNote: Story = {
  render: () => (
    <NoteSectionDemo initialNote="今日のタスクを完了させる。午後は集中タイムを確保する。" />
  ),
};

/** 複数行テキスト。textarea が自動拡張する。 */
export const MultilineNote: Story = {
  render: () => (
    <NoteSectionDemo
      initialNote={`1. 朝のミーティング準備\n2. 設計書レビュー\n3. コードレビュー対応\n4. ドキュメント更新`}
    />
  ),
};

/** HTMLタグが含まれる場合。自動的に除去してプレーンテキスト表示する。 */
export const WithHtmlContent: Story = {
  render: () => <NoteSectionDemo initialNote="<p>HTMLタグが<b>除去</b>される</p><br/>次の行" />,
};

/** アイコンなし。 */
export const WithoutIcon: Story = {
  render: () => {
    const [note, setNote] = useState('');
    return (
      <div className="w-80">
        <NoteSection label="メモ" note={note} onNoteChange={setNote} placeholder="メモを入力..." />
      </div>
    );
  },
};

/** 無効化状態。textarea が操作不可になる。 */
export const Disabled: Story = {
  render: () => <NoteSectionDemo initialNote="このメモは編集できません。" disabled />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole('textbox');
    expect(textarea).toBeDisabled();
  },
};

/** カスタム最大文字数（500文字）。 */
export const CustomMaxLength: Story = {
  render: () => <NoteSectionDemo maxLength={500} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('0/500')).toBeInTheDocument();
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-8">
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">Default（空）</p>
        <NoteSectionDemo />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">WithNote（テキストあり）</p>
        <NoteSectionDemo initialNote="今日のタスクを完了させる。" />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">MultilineNote（複数行）</p>
        <NoteSectionDemo
          initialNote={`1. 朝のミーティング準備\n2. 設計書レビュー\n3. コードレビュー対応`}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">Disabled（無効化）</p>
        <NoteSectionDemo initialNote="編集不可のメモ。" disabled />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">CustomMaxLength（500文字上限）</p>
        <NoteSectionDemo maxLength={500} />
      </div>
    </div>
  ),
};
