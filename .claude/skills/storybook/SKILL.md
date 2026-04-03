---
name: storybook
description: Storybook Story作成スキル。UIコンポーネントのStory追加・更新時に自動発動。公式ベストプラクティスに基づいたStory作成を支援。
effort: medium
maxTurns: 15
---

# Storybook Story作成スキル

## 3つの原則

1. **Storybookが正**: Storyにあるパターンのみ使用可。新パターンは先にStoryを追加
2. **AllPatterns必須**: 全コンポーネントStoryに `AllPatterns` Story を含める
3. **セマンティックトークンのみ**: 直接カラー (`text-blue-500`) 禁止

---

## レイヤー判定

| 場所                         | title prefix         | テンプレート      |
| ---------------------------- | -------------------- | ----------------- |
| `src/components/ui/`         | `Components/UI/`     | UI Component      |
| `src/components/common/`     | `Components/Common/` | UI Component      |
| `src/shell/components/`      | `Components/Shell/`  | UI Component      |
| `src/features/*/components/` | `Features/`          | Feature Component |
| `src/styles/tokens/`         | `Foundations/`       | Foundation        |
| `src/stories/patterns/`      | `Patterns/`          | Pattern           |

---

## モック戦略（意思決定ツリー）

```
コンポーネントの依存は？
│
├── props のみ           → モック不要（グローバルデコレータで十分）
│
├── tRPC クエリ/ミューテーション
│   ├── デフォルトデータで十分 → trpc-defaults.ts に追加
│   └── Story固有データが必要 → parameters.trpcMocks で指定
│       ├── ローディング状態   → parameters: { trpcPending: true }
│       └── エラー状態        → parameters: { trpcError: { path, code } }
│
├── Zustand ストア
│   └── parameters.storeMocks で指定
│       例: storeMocks: { useAuthStore: PRESET_AUTH.authenticated }
│
└── AllPatterns内で複数状態を並べる
    └── <StoryTRPCProvider mocks={...}> で直接ラップ
```

**参照**: `references/mock-patterns.md` に API 詳細

---

## 共通ルール

### CSF3 + satisfies Meta

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta = {
  title: 'Components/UI/MyComponent',
  component: MyComponent,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof MyComponent>;

export default meta;
type Story = StoryObj<typeof meta>;
```

### Canvas と Docs の分離

- **Canvas**: render のみ。見出し・説明テキストは入れない（Foundations/Patterns 除く）
- **Docs**: テキスト説明 + Controls

### JSDoc

1行で簡潔に。末尾に句点。

```tsx
/** 基本的な削除確認ダイアログ。最小構成の例。 */
export const Default: Story = { ... };
```

### AllPatterns Story

```tsx
/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => <div className="flex flex-col items-start gap-6">{/* 全バリアント */}</div>,
};
```

### play 関数（インタラクションテスト）

```tsx
import { expect, userEvent, within } from 'storybook/test';

export const ClickTest: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button'));
    await expect(canvas.getByRole('button')).toHaveAttribute('data-clicked', 'true');
  },
};
```

---

## 運用ルール

| 変更                   | Story側の対応                 |
| ---------------------- | ----------------------------- |
| コンポーネント新規作成 | 同時にStoryも作成             |
| props追加              | argTypes追加、Story使用例追加 |
| variant追加            | AllPatternsに追加             |
| コンポーネント削除     | Storyも削除                   |

---

## チェックリスト

- [ ] `satisfies Meta<typeof Component>` + `StoryObj<typeof meta>`
- [ ] `AllPatterns` Story 作成
- [ ] JSDoc は1行・句点つき
- [ ] セマンティックトークンのみ使用
- [ ] アイコンボタンに `aria-label`
- [ ] Canvas にテキストなし（Foundations/Patterns除く）
- [ ] `npm run storybook:coverage` で確認

---

## 詳細ドキュメント

| ドキュメント                  | 内容                               |
| ----------------------------- | ---------------------------------- |
| `templates/story.md`          | 全レイヤーのテンプレート集         |
| `references/mock-patterns.md` | tRPC/Store モック API リファレンス |
| `references/dark-mode.md`     | ダークモード3層アーキテクチャ      |
| `references/mcp-addon.md`     | Storybook MCP Server 連携          |

## デザイントークン早見表

| カテゴリ        | 許可値                                                                     |
| --------------- | -------------------------------------------------------------------------- |
| **Spacing**     | `0`, `1`(4px), `2`(8px), `4`(16px), `6`(24px), `8`(32px), `12`, `16`, `24` |
| **Radius**      | `rounded-none`, `rounded-lg`(8px), `rounded-2xl`(16px), `rounded-full`     |
| **Icon Size**   | `size-3.5`, `size-4`, `size-5`, `size-6`, `size-8`, `size-10`              |
| **Font Weight** | `font-normal`, `font-bold` のみ                                            |
| **Shadow**      | `shadow-xs`(input), `shadow-sm`(Raised), `shadow-card`(Overlay)            |
| **Transition**  | `transition-colors duration-150`（標準）                                   |
