# Patterns テンプレート

実装パターンのドキュメント。`src/stories/patterns/` が対象。

## 用途

Patterns は「コンポーネントの使い方・組み合わせ方」を見せるドキュメント Story。
Primitives/Recipes の「こう組み合わせる」という実装ガイドラインの役割。

## 他レイヤーとの違い

| 項目            | Primitives/Recipes                | Patterns                             |
| --------------- | --------------------------------- | ------------------------------------ |
| 配置場所        | コンポーネントの隣（co-location） | `src/stories/patterns/` に集約       |
| import 対象     | 自分自身のコンポーネント          | 他の Primitive/Recipe コンポーネント |
| Canvas テキスト | 禁止                              | OK（ガイドテーブル、使い分け説明）   |
| 目的            | コンポーネントの全バリアント表示  | 実装パターンのドキュメント化         |

## 基本テンプレート

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Button } from '@/components/ui/button';
// ... 他のコンポーネントを import

const meta = {
  title: 'Patterns/Feedback',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/** 使い分けガイド + 全パターン一覧。 */
export const Overview: Story = {
  render: () => (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Feedback Patterns</h1>
      <p className="text-muted-foreground mb-8">
        ユーザーへのフィードバック。Toast、Alert、InlineMessage の使い分け。
      </p>
      <section className="bg-card border-border rounded-xl border p-6">
        <h2 className="mb-4 text-lg font-bold">使い分けガイド</h2>
        <table className="w-full text-sm">
          {/* ... */}
        </table>
      </section>
    </div>
  ),
};

/** Toast通知パターン。 */
export const ToastExamples: Story = {
  render: () => (/* Toast の各バリエーション */),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (/* Overview + 全バリエーション */),
};
```

## Story の構成

**標準構成（多くのパターンで使用）:**

1. **Overview** — 使い分けガイド + 全バリエーションを1つの Story に集約

**複雑なパターン向け（ErrorPages 等）:**

1. **Overview** — 使い分けガイド（テーブル + 説明テキスト）
2. **個別パターン** — 各バリエーションの実装例
3. **AllPatterns** — 全パターンを一覧表示

## 既存パターン一覧

| Story                   | 内容                            |
| ----------------------- | ------------------------------- |
| `Patterns/Forms`        | フォーム入力パターン            |
| `Patterns/Feedback`     | Toast, Alert, InlineMessage     |
| `Patterns/Loading`      | Skeleton, Spinner, Progress     |
| `Patterns/Search`       | 検索UI パターン                 |
| `Patterns/Selection`    | 選択UI パターン                 |
| `Patterns/Actions`      | アクションボタン配置            |
| `Patterns/Confirmation` | 確認ダイアログ（ConfirmDialog） |
| `Patterns/EmptyStates`  | 空状態の表示                    |
| `Patterns/ErrorPages`   | エラーページ                    |
| `Patterns/Cards`        | カードレイアウト                |

## 新パターン追加時

1. `src/stories/patterns/{Name}.stories.tsx` を作成
2. `title: 'Patterns/{Name}'` を設定
3. Overview Story でガイドテーブル + バリエーションを作成
4. 複雑な場合のみ個別 Story + AllPatterns を追加

## 参考実装

- `src/stories/patterns/Feedback.stories.tsx` — Overview に全バリエーション集約（標準構成）
- `src/stories/patterns/Confirmation.stories.tsx` — ConfirmDialog の実コンポーネント使用例
- `src/stories/patterns/ErrorPages.stories.tsx` — 個別 Story + カタログ構成（複雑なパターン向け）
