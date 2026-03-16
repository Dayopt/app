# Recipes テンプレート

2つ以上の Primitives を組み合わせた複合パターン。
`src/core/components/`, `src/components/recipes/`, `src/components/common/` が対象。

## Primitives との違い

| 項目             | Primitives                 | Recipes                                   |
| ---------------- | -------------------------- | ----------------------------------------- |
| `component` 指定 | あり（単一コンポーネント） | なし（組み合わせパターン）                |
| Story 型         | `StoryObj<typeof meta>`    | `StoryObj<typeof meta>` or `StoryObj`     |
| 状態管理         | args 駆動                  | Interactive Wrapper で状態管理            |
| モック           | 不要                       | Feature 依存部分を Mock で差し替え        |
| story-helpers    | 不要                       | 共通ヘルパーを `story-helpers.tsx` に分離 |

## 基本テンプレート

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Components/Common/ActionFooter',
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta; // component 指定なし

export default meta;
type Story = StoryObj<typeof meta>;

// ── Mock Components（Feature 依存を切り離す）──

function MockTagRow({ tagName }: { tagName?: string }) {
  return (
    <div className="flex items-center gap-2 px-5 pt-5 pb-1">
      <span className="text-muted-foreground">{tagName ?? 'Add tag'}</span>
    </div>
  );
}

// ── Interactive Wrapper（状態を内包）──

interface EntryInspectorStoryProps {
  entryState: 'upcoming' | 'past';
  origin: 'planned';
  initialNote?: string;
}

function EntryInspectorStory({ entryState, origin, initialNote = '' }: EntryInspectorStoryProps) {
  const [note, setNote] = useState(initialNote);
  // ... 他の状態

  return (
    <InspectorFrame>
      <InspectorDetailsLayout
        tagRow={<MockTagRow />}
        note={<InlineNoteSection note={note} onNoteChange={setNote} />}
        // ...
      />
    </InspectorFrame>
  );
}

// ── Stories ──

/** 未来の予定エントリ。予定行は編集可能、記録行はプレースホルダー。 */
export const UpcomingPlanned: Story = {
  render: () => <EntryInspectorStory entryState="upcoming" origin="planned" />,
};

/** 完了した予定エントリ。予定 vs 記録の差分表示。 */
export const PastPlanned: Story = {
  render: () => <EntryInspectorStory entryState="past" origin="planned" />,
};

// ── AllPatterns（横並び比較）──

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-6">
      <div>
        <p className="text-muted-foreground mb-3 text-center text-xs font-medium">
          Upcoming + Planned
        </p>
        <EntryInspectorStory entryState="upcoming" origin="planned" />
      </div>
      <div>
        <p className="text-muted-foreground mb-3 text-center text-xs font-medium">Past + Planned</p>
        <EntryInspectorStory entryState="past" origin="planned" />
      </div>
    </div>
  ),
};
```

## Interactive Wrapper パターン

状態を持つコンポーネントは **Interactive Wrapper** で包む。

### 命名規則

- Wrapper 関数名: `XxxStory`（例: `EntryInspectorStory`, `FieldStory`）
- Props interface: `XxxStoryProps`
- ファイル内の配置順: Mock → Interface → Wrapper → Stories → AllPatterns

### なぜ必要か

Recipes は複数コンポーネントの組み合わせなので `args` だけでは状態を表現できない。
Wrapper が `useState` で状態を管理し、各 Story は props でバリエーションを指定する。

## story-helpers.tsx

複数の Story ファイルで共通利用するモック・ヘルパーは `story-helpers.tsx` に分離。

```tsx
// src/core/components/inspector/story-helpers.tsx

/** Inspector風コンテナ（400px幅） */
export function InspectorFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card surface-raised-heavy w-[400px] overflow-hidden rounded-2xl">
      {children}
    </div>
  );
}

/** モック用タグデータ */
export const mockTags: Tag[] = [{ id: 'tag-1', name: '仕事', color: 'blue' /* ... */ }];
```

### story-helpers に入れるもの

- 共通コンテナ（`InspectorFrame` 等）
- モックデータ（`mockTags`, `mockPlan` 等）
- Feature 依存をモック化したボタン（`MockPlanLinkButton` 等）

### story-helpers に入れないもの

- Story 固有のヘルパー → Story ファイル内に定義
- 1箇所でしか使わないモック → Story ファイル内に定義

## AllPatterns の横並びパターン

Recipes の AllPatterns はバリエーション比較のため**横並び + ラベル**にする:

```tsx
<div className="flex flex-wrap items-start gap-6">
  <div>
    <p className="text-muted-foreground mb-3 text-center text-xs font-medium">ラベル</p>
    <ComponentStory variant="a" />
  </div>
</div>
```

## 時間制約（Time waits for no one）

Inspector Story を作る際、`entryState` に応じた制約を必ず反映する。
詳細: `.claude/rules/temporal-constraints.md`

| entryState | 予定時間         | 日付変更            | 記録時間         | 充実度 | メモ   |
| ---------- | ---------------- | ------------------- | ---------------- | ------ | ------ |
| `upcoming` | 編集可           | 可（minDate=today） | プレースホルダー | 非表示 | 編集可 |
| `active`   | 編集可           | 可（minDate=today） | 編集可           | 編集可 | 編集可 |
| `past`     | ロック(disabled) | 不可(disabled)      | 編集可           | 編集可 | 編集可 |

Story でこの制約を確認できるよう、`PastPlanned` は予定行がグレー表示になることを示す。

## 参考実装

- `src/features/entry/components/inspector/EntryInspector.stories.tsx` — Interactive Wrapper + Mock の実例
- `src/features/entry/components/inspector/story-helpers.tsx` — 共通ヘルパーの実例
- `src/components/ui/action-footer.stories.tsx` — シンプルな Recipe Story
