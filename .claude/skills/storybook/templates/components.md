# Components テンプレート

UIコンポーネント（単体・複合・Feature）の Story 作成用。

## 対象ディレクトリ

| ディレクトリ                 | title prefix         | component 指定 |
| ---------------------------- | -------------------- | -------------- |
| `src/components/ui/`         | `Components/UI/`     | あり           |
| `src/components/common/`     | `Components/Common/` | あり or なし   |
| `src/shell/components/`      | `Components/Shell/`  | あり           |
| `src/features/*/components/` | `Features/`          | あり           |

## 基本テンプレート

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MyComponent } from './my-component';

const meta = {
  title: 'Components/UI/MyComponent',
  component: MyComponent,
  tags: [], // MDX Docs を使う場合。テーブル不要なら ['autodocs']
  parameters: {
    layout: 'centered', // centered | fullscreen | padded
  },
} satisfies Meta<typeof MyComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 基本的な使用例。最小構成。 */
export const Default: Story = {
  args: {
    /* デフォルトのprops */
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <MyComponent />
    </div>
  ),
};
```

### Disabled Story（disabled prop がある場合）

```tsx
/** 無効状態。 */
export const Disabled: Story = {
  args: { disabled: true },
};
```

## tags の選び方

| 条件                             | tags           | 理由                         |
| -------------------------------- | -------------- | ---------------------------- |
| テーブルが必要 → MDX Docs を作成 | `[]`           | MDX と autodocs の競合を回避 |
| テーブル不要 → JSDoc だけで十分  | `['autodocs']` | JSDoc から Docs を自動生成   |

### カスタムタグ

| タグ        | 用途                                  | Vitest除外 |
| ----------- | ------------------------------------- | ---------- |
| `critical`  | ユーザーのcritical path（優先テスト） | No         |
| `docs-only` | ドキュメント専用（テストから除外）    | Yes        |
| `wip`       | 作業中（テストから除外）              | Yes        |

## layout パラメータ

| 値           | 用途                                     |
| ------------ | ---------------------------------------- |
| `centered`   | 小さいコンポーネント（Button, Badge 等） |
| `padded`     | 中サイズ（Card, Form 等）                |
| `fullscreen` | 全幅コンポーネント（Header, Sidebar 等） |

---

## 複合コンポーネント（component 指定なし）

2つ以上のコンポーネントを組み合わせたパターン。
`src/components/common/` が該当。

```tsx
const meta = {
  title: 'Components/Common/ActionFooter',
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta; // component 指定なし

export default meta;
type Story = StoryObj<typeof meta>;
```

### Interactive Wrapper パターン

状態を持つコンポーネントは **Interactive Wrapper** で包む。

```tsx
// ── Interactive Wrapper（状態を内包）──

interface EntryInspectorStoryProps {
  entryState: 'upcoming' | 'past';
}

function EntryInspectorStory({ entryState }: EntryInspectorStoryProps) {
  const [note, setNote] = useState('');
  return (
    <InspectorFrame>
      <InspectorDetailsLayout note={note} onNoteChange={setNote} />
    </InspectorFrame>
  );
}

/** 未来の予定エントリ。 */
export const UpcomingPlanned: Story = {
  render: () => <EntryInspectorStory entryState="upcoming" />,
};
```

**命名規則**: Wrapper 関数名は `XxxStory`、Props は `XxxStoryProps`。

### story-helpers.tsx

複数の Story ファイルで共通利用するモック・ヘルパーは `story-helpers.tsx` に分離。

入れるもの: 共通コンテナ、モックデータ、Feature 依存をモック化したコンポーネント。
入れないもの: 1箇所でしか使わないモック → Story ファイル内に定義。

### AllPatterns の横並びパターン

複合コンポーネントの AllPatterns はバリエーション比較のため横並び + ラベル:

```tsx
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-6">
      <div>
        <p className="text-muted-foreground mb-3 text-center text-xs font-medium">ラベル</p>
        <ComponentStory variant="a" />
      </div>
    </div>
  ),
};
```

---

## Feature コンポーネント

`src/features/*/components/` が対象。

### Storybook に入れるべきか

| 条件                                         | 判断                      |
| -------------------------------------------- | ------------------------- |
| props 駆動の純粋UI                           | 入れる                    |
| tRPC/Zustand に直接依存                      | 入れない（コスト > 価値） |
| Feature の barrel export (`index.ts`) にある | 入れる候補                |
| barrel export にない（内部コンポーネント）   | 入れない                  |

**原則**: データ依存コンポーネントは無理に Storybook に入れない。
純粋UIに分離できるなら `src/components/common/` に移動する。

### Feature Boundaries

- Feature Story は同一 Feature 内のコンポーネントのみ import 可能
- 他 Feature のコンポーネントが必要 → Mock で差し替え
- 共有コンポーネント（`@/components/`, `@/components/ui/`）は import OK

### title 命名

```
Features/{FeatureName}/{ComponentName}
```

---

## argTypes 設計

```tsx
argTypes: {
  variant: {
    control: 'select',
    options: ['primary', 'secondary', 'outline'],
    description: 'ボタンのスタイルバリアント',     // 日本語で記述
  },
  disabled: {
    control: 'boolean',
    description: '無効状態',
  },
  className: {
    table: { disable: true },                       // 内部用propsは非表示
  },
}
```

## MDX Docs テンプレート（テーブルが必要な場合）

```mdx
import { Canvas, Controls, Meta, Primary, Stories } from '@storybook/addon-docs/blocks';
import * as MyComponentStories from './my-component.stories';

<Meta of={MyComponentStories} />

<div className="prose dark:prose-invert max-w-4xl mx-auto">

# MyComponent

コンポーネントの概要説明。1〜2行。

## 比較や分類（テーブル）

| 項目 | 説明 |
| ---- | ---- |
| ...  | ...  |

## Default

<Primary />

<Controls />

<Stories includePrimary={false} />

</div>
```

## 避けるべきパターン

```tsx
// ❌ 単純なprops渡しに render は不要
export const Bad: Story = {
  render: () => <Button variant="primary">Click</Button>,
};
// ✅ args を使う
export const Good: Story = {
  args: { variant: 'primary', children: 'Click' },
};

// ❌ 組み合わせ爆発
export const PrimarySmall: Story = { ... };
export const PrimaryMedium: Story = { ... };
// ✅ AllPatterns で一覧 + Controls で操作
```

## 時間制約（Inspector Story 向け）

Inspector Story を作る際、`entryState` に応じた制約を必ず反映する。
詳細: `.claude/rules/temporal-constraints.md`

## 参考実装

- `src/components/ui/alert-dialog.stories.tsx` — Primitives の実例
- `src/components/ui/alert-dialog.docs.mdx` — MDX Docs の実例
- `src/features/entry/components/inspector/EntryInspector.stories.tsx` — Interactive Wrapper + Mock
- `src/features/entry/components/inspector/story-helpers.tsx` — 共通ヘルパー
