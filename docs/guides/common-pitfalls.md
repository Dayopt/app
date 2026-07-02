# Common Pitfalls

開発時によくある間違いと、正しいパターンの一覧。AI（Claude Code）が同じミスを繰り返さないための参照ドキュメント。

---

## 1. 旧用語の使用

ADR-011 で `plans` + `records` テーブルは `entries` に統合済み。

```tsx
// ❌ 旧用語
api.plans.create(...)
from('plans')
PlanService

// ✅ 現在
api.entry.create(...)
from('entries')
EntryService
```

コードベースやドキュメントで `plan` / `record` を見かけたら、`entry` / `entries` に読み替える。

---

## 2. 過去エントリの編集（時間不変原則）

`EntryState === 'past'` のエントリは読み取り専用。スケジュール変更は不可。

```tsx
// ❌ 過去エントリの start_time を変更
updateEntry({ id, start_time: newTime }); // past の場合エラー

// ✅ 許可される操作（実績記録のみ）
updateEntry({ id, actual_start, actual_end, fulfillment_score, note });
```

**二重防御**: UI（disabled 表示）+ ロジックガード（`assertEntryEditable()`）の両方で制御。

詳細: [ADR-015 時間不変原則](../decisions/015-time-immutability-principle.md)

---

## 3. 直接カラーの使用

Tailwind の直接カラークラスは禁止。セマンティックトークンのみ使用。

```tsx
// ❌ 直接カラー
<div className="text-red-500 bg-blue-100 border-gray-300" />

// ✅ セマンティックトークン
<div className="text-destructive bg-muted border-border" />
```

使用可能なトークンは [Colors](?path=/story/foundations-colors--all-colors) Story で確認。

---

## 4. Feature 間の直接 import

Feature 同士は直接 import できない。Composition Layer（`src/app/` のページ）で合成する。

```tsx
// ❌ Calendar から Entry を直接 import
import { EntryCard } from '@/features/entry/components/EntryCard';

// ❌ deep import
import { useEntry } from '@/features/entry/hooks/useEntry';

// ✅ barrel export 経由
import { EntryCard } from '@/features/entry';

// ✅ ページ層（Composition Layer）で合成
// src/app/[locale]/(app)/calendar/page.tsx
import { CalendarController } from '@/features/calendar';
import { EntryInspector } from '@/features/entry';
```

**検出**: `npm run lint:boundaries` で違反を検出。

---

## 5. 禁止されたパターン

| ❌ 禁止                        | ✅ 代替                          | 理由                        |
| ------------------------------ | -------------------------------- | --------------------------- |
| `any` / `unknown` / `Function` | 具体的な型、`as never`           | 型安全性                    |
| `console.log`                  | `@/lib/logger`                   | 本番ログ制御                |
| `useEffect` で fetch           | tRPC + TanStack Query            | キャッシュ・エラー処理      |
| `style` 属性                   | Tailwind クラス                  | 一貫性                      |
| `export default`               | named export                     | App Router 特殊ファイル除く |
| `React.FC`                     | `export function Component() {}` | 簡潔さ                      |

---

## 6. Storybook 関連

### Storybook にないパターンを使う

Storybook は Single Source of Truth。記載されていないパターンは使わない。

```tsx
// ❌ Storybook に size="xl" の Story がない
<Button size="xl">Click</Button>

// ✅ Story に記載されているパターンのみ使用
<Button size="lg">Click</Button>
```

新パターンが必要 → 先に Story を追加してからコードで使用。

### Canvas にテキストを入れる

```tsx
// ❌ Canvas Story に見出しやテキスト
export const Default: Story = {
  render: () => (
    <div>
      <h1>ヘッダー</h1> {/* ← 禁止 */}
      <MyComponent />
    </div>
  ),
};

// ✅ コンポーネントのみ（テキストは Docs MDX へ）
export const Default: Story = {
  render: () => <MyComponent />,
};
```

例外: Foundations と Patterns は Canvas 内テキスト OK。

---

## 7. Supabase / DB 関連

### Docker でのデプロイ

この環境に Docker はない。Edge Functions のデプロイには `--use-api` フラグが必須。

```bash
# ❌
supabase functions deploy

# ✅
supabase functions deploy --use-api
```

### db push の --project-ref

通常の migration 適用は Supabase GitHub integration が担当する。手動 `supabase db push` は emergency only。

実行する場合も `supabase db push` は `--project-ref` を受け付けない。リンク済みプロジェクトに対して実行されるため、事前に `supabase link --project-ref ...` の対象を確認する。

---

## 8. コミットメッセージ

```bash
# ❌ 英語
git commit -m "fix: button color"

# ✅ 日本語 + Conventional Commits
git commit -m "fix(ui): ボタンのカラーをセマンティックトークンに修正"
```

---

## 関連ドキュメント

| ドキュメント                                          | 内容                   |
| ----------------------------------------------------- | ---------------------- |
| [Developer Map](developer-map.md)                     | ディレクトリ構成ガイド |
| [Domain Glossary](../architecture/domain-glossary.md) | ドメイン用語定義       |
| [Error Patterns](../architecture/error-patterns.md)   | エラーコード体系       |
