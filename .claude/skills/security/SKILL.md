---
name: security
description: セキュリティ監査スキル。認証/認可、APIエンドポイント、ユーザー入力処理、外部データ取得の実装時に自動発動。OWASP Top 10観点でのチェックを実施。
effort: high
maxTurns: 25
disallowedTools: Write
---

# セキュリティ監査スキル

## When to Use

以下の状況で自動発動：

- 認証・認可に関するコード変更時
- tRPCエンドポイント作成・修正時
- ユーザー入力を扱うフォーム実装時
- 外部データ取得処理の実装時

## When NOT to Use

- UIのみの変更
- 型定義のみの変更
- テストコードの作成

## チェックリスト（重要度順）

### 1. [Critical] 認証・認可

**確認ポイント**:

- `protectedProcedure` を使用しているか
- `ctx.userId` でデータアクセスを制限しているか

**Dayoptの正しいパターン** (`src/server/api/routers/tags.ts`参照):

```typescript
// ✅ Dayoptパターン
export const tagsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ ... }).optional())
    .query(async ({ ctx, input }) => {
      const service = createTagService(ctx.supabase);
      return await service.list({
        userId: ctx.userId!,  // 必須: userIdでフィルタ
        ...input,
      });
    }),
});
```

**チェック項目**:

- [ ] 全てのエンドポイントで `protectedProcedure` を使用
- [ ] Service層に `userId` を渡している
- [ ] publicProcedure は本当に公開が必要な場合のみ

### 2. [Critical] 入力検証

**確認ポイント**:

- 全ての入力を Zod でバリデーション
- UUID、文字列長、数値範囲を制限

**Dayoptの正しいパターン**:

```typescript
// ✅ 厳密なバリデーション
.input(z.object({
  planId: z.string().uuid(),                    // UUID検証
  title: z.string().min(1).max(200),            // 長さ制限
  sortOrder: z.enum(['asc', 'desc']).default('asc'),  // 列挙型
}))

// ❌ 危険: 検証なし
.input(z.object({
  id: z.string(),  // UUIDでない文字列を受け入れてしまう
}))
```

**チェック項目**:

- [ ] ID系は `z.string().uuid()` で検証
- [ ] 文字列は `min(1).max(N)` で長さ制限
- [ ] 数値は `int().min(0).max(N)` で範囲制限
- [ ] 配列は `z.array().max(100)` で上限設定

### 3. [High] SQLインジェクション対策

**確認ポイント**:

- Supabaseクエリビルダーを使用
- ユーザー入力を直接埋め込まない

```typescript
// ✅ 安全: クエリビルダー使用
const { data } = await supabase
  .from('tags')
  .select('*')
  .eq('user_id', userId)
  .ilike('name', `%${searchTerm}%`);

// ❌ 危険: 生SQL + 文字列結合
const { data } = await supabase.rpc('search', {
  query: `SELECT * FROM tags WHERE name = '${userInput}'`, // 危険!
});
```

### 4. [High] XSS対策

**確認ポイント**:

- `dangerouslySetInnerHTML` を使用していない
- Reactの自動エスケープを信頼

```typescript
// ❌ 危険
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// ✅ 安全（Reactが自動エスケープ）
<div>{userInput}</div>
```

### 5. [Medium] 機密情報の取り扱い

**チェック項目**:

- [ ] `NEXT_PUBLIC_` は本当に公開が必要な値のみ
- [ ] APIキーやシークレットがクライアントに露出していない
- [ ] console.logに機密情報を出力していない

### 6. [Low] 依存関係のセキュリティ

```bash
# 脆弱性チェック
npm audit
```

## 出力形式

```markdown
## セキュリティ監査結果

### Critical

- [ ] [ファイル:行] 問題の説明
  - リスク:
  - 修正:

### High

- [ ] ...

### Medium

- [x] 問題なし

### Low

- [x] npm audit: 脆弱性なし
```

## Dayopt固有ルール

1. **全データアクセスは `userId` でフィルタ** - RLSだけに頼らない
2. **Service層を経由** - ルーターに直接ロジックを書かない
3. **`handleServiceError()` を使用** - 直接TRPCErrorをthrowしない

## 関連エージェント

- **security-auditor** — 既存コードの回帰スキャン（PASS/FAIL判定）。PR前・週次で実行
- **red-team / blue-team** — 探索的な攻防監査。月次・大きな機能追加時

> このスキルは「実装時のガイド」、エージェントは「既存コードの検査」。新規コード実装時はこのスキルを、既存コードのスキャンはエージェントを使う。

## 関連スキル

- `/trpc-router-creating` - 認証付きエンドポイント作成
- `/test` - セキュリティテストの作成
