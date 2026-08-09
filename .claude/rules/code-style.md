---
paths:
  - 'apps/product/src/**/*.{ts,tsx}'
  - 'package.json'
---

# コーディング規約

## 型定義

具体的な型を使い、型安全性を最大化する。

- union型のvariance問題には `as never`（`as any` 禁止）
- `unknown` は型ガードと組み合わせる場合のみ許可

## スタイリング

セマンティックトークンでダークモード対応を自動化する。

```tsx
// ✅ セマンティックトークン
<div className="bg-card text-foreground border-border" />

// ❌ 直接カラー、style属性
<div className="text-blue-500" />
```

## UIコンポーネント

Storybookに記載されているパターンのみ使用。新パターンは先にStory追加。

## ログ出力

`@/lib/logger` を使用。`console.log` は本番コード禁止。

## Server Component vs Client Component

Server Component をデフォルト。useState / useEffect / イベントハンドラ / ブラウザAPIが必要な場合のみ Client。

## セキュリティ

- 認証必須エンドポイントは `protectedProcedure`
- `ctx.userId` でデータアクセスを制限
- `dangerouslySetInnerHTML` 禁止

## セマンティックトークン補足

- 透過（`/10`など）は `state-*` トークンのみ許可
- domain固有色は`packages/foundations`で公開済みのsemantic tokenだけを使用する

## Tailwind v4 既知の落とし穴

- `@theme` で `--spacing-xs/sm/md/lg/xl/2xl` を定義すると `max-w-sm/md/lg` 等が壊れる
- Tailwind v4 は `--spacing-*` > `--container-*` の優先順で解決するため
- **対策**: カスタムスペーシングは `:root` で定義し `@theme` に入れない
- 同様に `--radius-*` 等のカスタム名もTailwindデフォルトと衝突する可能性あり

## 依存関係の追加

パッケージ追加前に確認:

1. ブラウザ標準API or 言語標準で実現できないか？
2. 既存の依存で代替できないか？
3. GitHub Stars >= 1000、最終コミット6ヶ月以内か？
4. 1つの機能のためだけに大きなライブラリを追加しない
5. 出口コストを言えるか？ — 捨てる・乗り換える時に何が壊れるか（API の浸透範囲、データの持ち出し、継続課金）を 1 文で言えない依存は採用前に調べる

### 技術選定スタンス（依存・ベンダー・ツール共通）

選定の巧拙より「ダメになった時に捨てられること」を重視する（反脆弱性・脱固定化・可逆性。経緯は [2026-08-09-antifragility-stance.md](../../docs/engineering/log/2026-08-09-antifragility-stance.md)）:

- **出口コストを見る**: 深く浸透する依存（DB / 認証 / 決済級）は [infra.md §出口コスト台帳](../../docs/engineering/infra.md#出口コスト台帳) に浸透の深さ・逃げ道・出口検討トリガーを登録する
- **小さく試してから広げる**: 本採用の前に限定 scope で検証する。全面導入を初手にしない
- **単一固定を可視化する**: 単一ベンダー・単一手段が構造上不可避な場合（例: DB）は、回避ではなく固定した事実と出口を台帳で見えるようにする。「念のため adapter 層」は作らない（YAGNI）

## eslint-disable の運用

disable は「ルールが誤検知している／意図的に逸脱する」場合の最終手段。まずコード側で解消できないか検討する。やむを得ず disable する場合は次を守る:

1. **必ず inline で `-- 理由` を書く**。前行コメントではなく disable ディレクティブと同じ行に書く（grep で「理由なし disable」を検出できる状態を保つ）。

   ```ts
   // ✅ react-hooks/exhaustive-deps -- 初回マウント時のみ URL から復元する意図的な mount-only effect
   // ❌ 理由なし、または前行コメントに分離
   ```

2. **`eslint-disable`（ファイル全体）より `eslint-disable-next-line`（1 行）を優先**。影響範囲を最小化する。
3. **未使用 disable は CI で fail する**。`reportUnusedDisableDirectives: 'error'`（`apps/product` / `apps/web` の `eslint.config.mjs`）により、対象ルールが発火しなくなった disable は自動検出される。リファクタで不要になった disable は放置せず削除する。
4. 新しいルールを `off` にして黙らせるより、`warn` + 段階的解消を検討する（例: `@typescript-eslint/no-unused-vars` は TS 本体 + Prettier が未使用 import を消すため低優先で `off`）。
