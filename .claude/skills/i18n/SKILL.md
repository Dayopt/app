---
name: i18n
description: UI テキストを含む component の新規実装・編集時、ハードコードされた日本語/英語の文字列リテラルを検出した時、`apps/product/messages/en/*.json` / `apps/product/messages/ja/*.json` 翻訳ファイルを編集する時、新規 locale namespace を `apps/product/src/lib/i18n/request.ts` に追加する時に発動。next-intl v4 の `useTranslations` / `getTranslations` パターンを適用する。内部ログやエラーコードなど非 UI 文字列には発動しない。
effort: low
maxTurns: 10
---

# 国際化（i18n）スキル

Dayoptの国際化対応を支援するスキル。next-intl v4を使用。

## When to Use

以下の状況で発動:

- 新規 component で UI テキスト（ボタン文言、ラベル、placeholder、aria-label）を書く時
- `apps/product/messages/en/*.json` / `apps/product/messages/ja/*.json` に新規キーを追加する時
- 新規 namespace を `apps/product/src/lib/i18n/request.ts` の `NAMESPACES` 配列に登録する時
- 既存 component で日本語/英語のハードコード文字列リテラル（`"記録"` / `"Save"` など）を検出した時
- en / ja のキー不整合（片方にしか存在しないキー、`lint:i18n` で検出される類）が発生した時

## When NOT to Use

- 内部ログ・logger 出力用の英語文字列（`logger.info('...')`、ユーザーに表示されない）
- ErrorBoundary のフォールバックメッセージなど開発者向け文言（`error-handling` skill の領域）
- Storybook の test fixture / story args の表示確認用文字列（実運用 UI ではない）

## 技術スタック

| 項目       | 内容                                   |
| ---------- | -------------------------------------- |
| ライブラリ | next-intl v4                           |
| 対応言語   | English (en), 日本語 (ja)              |
| デフォルト | English                                |
| URL方式    | as-needed（/ja/\* のみプレフィックス） |

## アーキテクチャ（重要）

### 全ネームスペースのマージ

`apps/product/src/lib/i18n/request.ts` が全ネームスペースを一括ロードし、`Object.assign` でルートレベルにマージする。

```
apps/product/messages/en/common.json  → { common: {...}, actions: {...}, confirm: {...}, ... }
apps/product/messages/en/plan.json    → { plan: {...} }
apps/product/messages/en/calendar.json → { calendar: {...} }
...
↓ Object.assign で全てマージ
{ common: {...}, actions: {...}, confirm: {...}, plan: {...}, calendar: {...}, ... }
```

**結果**: `useTranslations()` を引数なしで呼ぶと、全ファイルの全キーにフルパスでアクセス可能。

### ロードされるネームスペース

`apps/product/src/lib/i18n/request.ts` の `NAMESPACES` 配列に登録されたファイルのみロードされる:

```typescript
const NAMESPACES = [
  'app',
  'auth',
  'calendar',
  'common',
  'error',
  'plan',
  'legal',
  'navigation',
  'notification',
  'onboarding',
  'settings',
  'stats',
  'tag',
] as const;
```

**注意**: `messages/` に JSON を置いただけではロードされない。`NAMESPACES` への登録が必要。

## 使用パターン

### Client Component（主要パターン）

```typescript
'use client';
import { useTranslations } from 'next-intl';

export function MyComponent() {
  // ✅ 引数なし — 全キーにフルパスでアクセス（最も一般的）
  const t = useTranslations();

  return (
    <div>
      <button>{t('actions.save')}</button>
      <p>{t('common.loading')}</p>
      <span>{t('plan.toast.created')}</span>
    </div>
  );
}
```

### スコープ付き（特定機能に閉じたコンポーネント向け）

```typescript
// ✅ スコープ指定 — キーが短くなる
const t = useTranslations('settings');
t('account.displayName'); // = t('settings.account.displayName')

// ⚠️ スコープ外のキーにはアクセスできない
// t('actions.save'); // ← settings.actions.save を探すので動かない
```

**判断基準**: 1つのネームスペースのキーしか使わないなら、スコープ付きでもOK。複数ネームスペースを跨ぐなら引数なし。

### Server Component

```typescript
import { getTranslations } from 'next-intl/server';

export async function MyPage() {
  const t = await getTranslations();
  return <h1>{t('common.loading')}</h1>;
}
```

### 変数埋め込み

```typescript
// JSON: { "greeting": "Hello, {name}!" }
t('greeting', { name: 'John' });
```

### 複数形

```typescript
// JSON: { "items": "{count, plural, =0 {No items} =1 {1 item} other {# items}}" }
t('items', { count: 5 }); // → "5 items"
```

## ファイル構造とキー配置ルール

### 翻訳ファイル一覧

| ファイル            | キー数 | 用途                                        |
| ------------------- | ------ | ------------------------------------------- |
| `common.json`       | 290+   | 共通キー（複数トップレベルキーを含む）      |
| `calendar.json`     | 300+   | カレンダー機能                              |
| `tag.json`          | 300+   | タグ管理                                    |
| `settings.json`     | 364    | 設定画面                                    |
| `legal.json`        | 370    | 法的文書                                    |
| `auth.json`         | 172    | 認証フロー                                  |
| `plan.json`         | 100+   | プラン機能（toast、削除確認、ステータス等） |
| `stats.json`        | 80     | 統計機能                                    |
| `navigation.json`   | 63     | ナビゲーション                              |
| `notification.json` | 61     | 通知                                        |
| `error.json`        | 58     | エラーページUI                              |
| `onboarding.json`   | 6      | オンボーディング                            |
| `app.json`          | 4      | アプリメタデータ専用                        |

### common.json の内部構造（最重要）

`common.json` は複数のトップレベルキーを持つ特殊なファイル:

| トップレベルキー | 用途                                                                  | 例                                             |
| ---------------- | --------------------------------------------------------------------- | ---------------------------------------------- |
| `common`         | ナビゲーション・状態・ユーティリティ                                  | `common.loading`, `common.back`, `common.undo` |
| `actions`        | **汎用アクション動詞** + ローディング状態                             | `actions.save`, `actions.deleting`             |
| `confirm`        | 確認ダイアログテンプレート                                            | `confirm.delete.title`                         |
| `aria`           | アクセシビリティラベル                                                | `aria.closeModal`                              |
| `status`         | ステータス表示                                                        | `status.loading`, `status.error`               |
| `time`           | 相対時間表現                                                          | `time.daysAgo`, `time.justNow`                 |
| `validation`     | バリデーションメッセージ                                              | `validation.required`                          |
| `errors`         | サービスエラー                                                        | `errors.generic`                               |
| その他           | `reminder`, `language`, `theme`, `createNew`, `createSheet`, `search` |

### キー配置の判断フロー

```
新しい翻訳キーを追加
│
├─ 汎用アクション動詞？（保存、削除、キャンセル等）
│  └─ YES → actions.*          例: actions.save, actions.cancel
│
├─ ローディング状態？（○○中...）
│  └─ YES → actions.*          例: actions.saving, actions.deleting
│
├─ ナビゲーション・UI状態？（戻る、次へ、読み込み中）
│  └─ YES → common.*           例: common.back, common.loading
│
├─ a11y ラベル？
│  └─ YES → aria.*             例: aria.closeModal
│
├─ 確認ダイアログのテンプレート？
│  └─ YES → confirm.*          例: confirm.delete.title
│
├─ バリデーション？
│  └─ YES → validation.*       例: validation.required
│
├─ 特定機能でしか使わない？
│  └─ YES → feature ファイル   例: plan.toast.created, calendar.toast.deleted
│
└─ 上記のどれにも当てはまらない
   └─ common.* に追加
```

### 具体例: どこに置くか

| テキスト               | 正しい配置                    | 理由               |
| ---------------------- | ----------------------------- | ------------------ |
| "保存"                 | `actions.save`                | 汎用アクション動詞 |
| "削除中..."            | `actions.deleting`            | ローディング状態   |
| "閉じる"               | `actions.close`               | 汎用アクション動詞 |
| "戻る"                 | `common.back`                 | ナビゲーション     |
| "読み込み中..."        | `common.loading`              | UI状態             |
| "プランを作成しました" | `plan.toast.created`          | plan 固有の toast  |
| "タグ名は必須です"     | `validation.tag.nameRequired` | バリデーション     |
| "メニューを開く"       | `aria.openMenu`               | a11y ラベル        |

## 新規翻訳キー追加手順

### 1. 配置先を決める（上記フロー参照）

### 2. 両言語に追加

**必ず en と ja の両方に追加する。キー構造は完全一致させる。**

```json
// apps/product/messages/en/plan.json — 追加
{
  "plan": {
    "toast": {
      "newKey": "English text"
    }
  }
}

// apps/product/messages/ja/plan.json — 追加
{
  "plan": {
    "toast": {
      "newKey": "日本語テキスト"
    }
  }
}
```

### 3. 検証

```bash
pnpm i18n:check    # en/ja のキー差分チェック
pnpm i18n:unused   # 未使用キーの検出
```

## 禁止事項

### ❌ ハードコードされた文字列

```typescript
// ❌ 禁止
<button>保存</button>
<p>エラーが発生しました</p>

// ✅ 正しい
<button>{t('actions.save')}</button>
<p>{t('errors.generic')}</p>
```

### ❌ 機能固有キーを common.json に置く

```json
// ❌ 禁止 — plan でしか使わないキーを common に置く
// common.json
{ "common": { "plan": { "created": "プランを作成しました" } } }

// ✅ 正しい — plan.json に置く
// plan.json
{ "plan": { "toast": { "created": "プランを作成しました" } } }
```

### ❌ 汎用単語を feature ファイルに重複定義

```typescript
// ❌ 禁止 — "保存" を tag.json に定義して使う
t('tag.group.save');

// ✅ 正しい — actions.save を再利用
t('actions.save');
```

### ❌ 片方の言語のみ追加

```
// ❌ en のみ追加、ja を忘れる
// → pnpm i18n:check でエラーになる
```

### ❌ NAMESPACES 未登録のファイルを使用

```
// ❌ apps/product/messages/en/myFeature.json を作成したが NAMESPACES に追加していない
// → apps/product/src/lib/i18n/request.ts の NAMESPACES 配列に追加が必要
```

### ❌ 直接インポート

```typescript
// ❌ 禁止（個別ファイルインポート）
import messages from '@/messages/en/common.json';

// ✅ 正しい（next-intl経由）
const t = useTranslations();
```

## チェックリスト

新しいUIテキスト追加時：

- [ ] 配置先を判断フローで決定したか
- [ ] en/ja 両方に追加したか（キー構造が完全一致）
- [ ] 汎用単語は `actions.*` / `common.*` を再利用しているか（重複定義していない）
- [ ] 機能固有キーは feature ファイルに置いたか（common.json に混ぜていない）
- [ ] キー名は意味のあるドット記法か（例: `plan.toast.created`）
- [ ] 変数がある場合は `{variable}` 形式か
- [ ] `pnpm i18n:check` が通るか

## 言語検出の仕組み

1. URLパスから言語を検出（`/ja/*` → 日本語）
2. デフォルトは英語（プレフィックスなし）
3. ミドルウェア（`apps/product/src/lib/supabase/middleware.ts`）が自動処理

## 関連ファイル

- `apps/product/src/lib/i18n/routing.ts` - ルーティング設定
- `apps/product/src/lib/i18n/request.ts` - メッセージローダー（NAMESPACES 定義）
- `apps/product/src/lib/i18n/navigation.ts` - ナビゲーションユーティリティ
- `apps/product/src/lib/supabase/middleware.ts` - 言語検出 + Auth ミドルウェア
- `apps/product/src/lib/i18n/scripts/check-keys.ts` - キー差分チェック（`pnpm i18n:check`）
- `apps/product/src/lib/i18n/scripts/find-unused.ts` - 未使用キー検出（`pnpm i18n:unused`）
