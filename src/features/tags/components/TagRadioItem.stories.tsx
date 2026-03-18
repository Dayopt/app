import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { TagRadioItem } from './TagRadioItem';

/**
 * TagRadioItem — ラジオ風タグ選択アイテム。
 *
 * タグ選択 UI で共通利用。色付きラジオインジケーター + タグ名。
 * 選択状態では インジケーターをタグカラーで塗りつぶし、チェックアイコンを表示。
 */
const meta = {
  title: 'Features/Tags/TagRadioItem',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** 未選択状態。アウトラインのみのラジオインジケーター。 */
export const Unselected: Story = {
  render: () => (
    <div className="w-64">
      <TagRadioItem
        tag={{ id: 'tag-1', color: 'blue' }}
        label="仕事"
        isSelected={false}
        onSelect={fn()}
      />
    </div>
  ),
};

/** 選択状態。タグカラーで塗りつぶされたインジケーターとチェックアイコン。 */
export const Selected: Story = {
  render: () => (
    <div className="w-64">
      <TagRadioItem tag={{ id: 'tag-1', color: 'blue' }} label="仕事" isSelected onSelect={fn()} />
    </div>
  ),
};

/** インデント付き（サブタグ表示）。pl-9 が適用される。 */
export const Indented: Story = {
  render: () => (
    <div className="w-64">
      <TagRadioItem
        tag={{ id: 'tag-2', color: 'indigo' }}
        label="仕事:会議"
        isSelected={false}
        onSelect={fn()}
        indented
      />
    </div>
  ),
};

/** インデント + 選択。 */
export const IndentedSelected: Story = {
  render: () => (
    <div className="w-64">
      <TagRadioItem
        tag={{ id: 'tag-2', color: 'indigo' }}
        label="仕事:開発"
        isSelected
        onSelect={fn()}
        indented
      />
    </div>
  ),
};

/** 無効化状態（disabled）。クリック不可・opacity-40。 */
export const Disabled: Story = {
  render: () => (
    <div className="w-64">
      <TagRadioItem
        tag={{ id: 'tag-3', color: 'gray' }}
        label="削除済みタグ"
        isSelected={false}
        onSelect={fn()}
        disabled
      />
    </div>
  ),
};

/** 全カラーバリエーション一覧。 */
export const AllColors: Story = {
  render: () => (
    <div role="radiogroup" aria-label="タグカラー一覧" className="w-64">
      {(
        [
          { color: 'red', label: 'レッド' },
          { color: 'orange', label: 'オレンジ' },
          { color: 'amber', label: 'アンバー' },
          { color: 'green', label: 'グリーン' },
          { color: 'teal', label: 'ティール' },
          { color: 'blue', label: 'ブルー' },
          { color: 'indigo', label: 'インディゴ' },
          { color: 'violet', label: 'バイオレット' },
          { color: 'pink', label: 'ピンク' },
          { color: 'gray', label: 'グレー' },
        ] as const
      ).map((c) => (
        <TagRadioItem
          key={c.color}
          tag={{ id: `tag-${c.color}`, color: c.color }}
          label={c.label}
          isSelected={false}
          onSelect={fn()}
        />
      ))}
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <section>
        <p className="text-muted-foreground mb-1 text-xs">Unselected</p>
        <div className="w-64">
          <TagRadioItem
            tag={{ id: 'tag-1', color: 'blue' }}
            label="仕事"
            isSelected={false}
            onSelect={fn()}
          />
        </div>
      </section>

      <section>
        <p className="text-muted-foreground mb-1 text-xs">Selected</p>
        <div className="w-64">
          <TagRadioItem
            tag={{ id: 'tag-1', color: 'blue' }}
            label="仕事"
            isSelected
            onSelect={fn()}
          />
        </div>
      </section>

      <section>
        <p className="text-muted-foreground mb-1 text-xs">Indented（サブタグ）</p>
        <div className="w-64">
          <TagRadioItem
            tag={{ id: 'tag-2', color: 'indigo' }}
            label="仕事:開発"
            isSelected={false}
            onSelect={fn()}
            indented
          />
        </div>
      </section>

      <section>
        <p className="text-muted-foreground mb-1 text-xs">Indented + Selected</p>
        <div className="w-64">
          <TagRadioItem
            tag={{ id: 'tag-2', color: 'indigo' }}
            label="仕事:開発"
            isSelected
            onSelect={fn()}
            indented
          />
        </div>
      </section>

      <section>
        <p className="text-muted-foreground mb-1 text-xs">Disabled</p>
        <div className="w-64">
          <TagRadioItem
            tag={{ id: 'tag-3', color: 'gray' }}
            label="削除済みタグ"
            isSelected={false}
            onSelect={fn()}
            disabled
          />
        </div>
      </section>

      <section>
        <p className="text-muted-foreground mb-1 text-xs">全カラー</p>
        <div role="radiogroup" aria-label="全カラーバリエーション" className="w-64">
          {(
            [
              { color: 'red', label: 'レッド' },
              { color: 'orange', label: 'オレンジ' },
              { color: 'amber', label: 'アンバー' },
              { color: 'green', label: 'グリーン' },
              { color: 'teal', label: 'ティール' },
              { color: 'blue', label: 'ブルー（選択）' },
              { color: 'indigo', label: 'インディゴ' },
              { color: 'violet', label: 'バイオレット' },
              { color: 'pink', label: 'ピンク' },
              { color: 'gray', label: 'グレー' },
            ] as const
          ).map((c) => (
            <TagRadioItem
              key={c.color}
              tag={{ id: `tag-${c.color}`, color: c.color }}
              label={c.label}
              isSelected={c.color === 'blue'}
              onSelect={fn()}
            />
          ))}
        </div>
      </section>
    </div>
  ),
};
