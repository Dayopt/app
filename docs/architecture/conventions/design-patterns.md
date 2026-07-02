---
status: current
last_verified: 2026-07-02
---

# 設計パターン

Dayoptで採用している設計パターンの解説。

---

## ディレクトリ構造: Feature-based

```
src/
├── app/           # Next.js App Router（ルーティング）
├── features/      # 機能ごとのモジュール
├── components/    # 共通コンポーネント
├── hooks/         # 共通フック
├── lib/           # ユーティリティ
├── platform/      # tRPC・Supabase等の基盤
└── types/         # 型定義
```

### features/ の構造

```
features/
├── calendar/      # カレンダー機能
│   ├── components/
│   ├── hooks/
│   ├── stores/
│   └── types/
├── entry/         # エントリ管理（統合ブロックモデル）
├── tags/          # タグ管理
└── ...
```

**なぜFeature-basedか**: 機能の追加・削除が容易、関連コードが近くにある、大規模アプリでもスケール。

---

## API層: Router → Service → Supabase

```
┌─────────────┐
│   Router    │ ← 入出力の定義、認証チェック
├─────────────┤
│   Service   │ ← ビジネスロジック
├─────────────┤
│  Supabase   │ ← データアクセス
└─────────────┘
```

### Router（薄い層）

```typescript
// src/features/entry/server/router.ts
create: protectedProcedure
  .input(createEntrySchema) // Zodでバリデーション
  .mutation(({ ctx, input }) => {
    const service = createEntryService(ctx.supabase);
    return service.create({ userId: ctx.userId, ...input });
  });
```

**役割**: 入力バリデーション（Zod）、認証・認可チェック、Serviceの呼び出し。

### Service（ビジネスロジック）

```typescript
// src/features/entry/server/entry-service.ts
class EntryService {
  async create(params: CreateEntryOptions) {
    this.validateEntry(params);
    const entryData = this.buildEntryData(params);
    return this.supabase.from('entries').insert(entryData);
  }
}
```

**なぜService層を分けるか**: テストしやすい（DBをモックできる）、ロジックの再利用、Routerを薄く保てる。

---

## 状態管理: UI状態 vs サーバー状態

### UI状態（Zustand）

```typescript
export const useCalendarStore = create(
  devtools(
    persist(
      (set) => ({
        view: 'week',
        setView: (view) => set({ view }),
      }),
      { name: 'calendar-store' },
    ),
  ),
);
```

**使うべき場面**: サイドバーの開閉、選択中のアイテム、フィルター条件、表示設定。

### サーバー状態（TanStack Query via tRPC）

```typescript
const { data: entries, isLoading } = api.entries.list.useQuery({
  startDate,
  endDate,
});
```

**使うべき場面**: サーバーから取得したデータ、一覧表示、詳細データ。

---

## コンポーネント: Presentational + Container

### Presentational（見た目）

```tsx
function EntryCard({ entry, onEdit, onDelete }) {
  return (
    <Card>
      <h3>{entry.title}</h3>
      <Button onClick={onEdit}>編集</Button>
    </Card>
  );
}
```

### Container（ロジック）

```tsx
function EntryCardContainer({ entryId }) {
  const { data: entry } = api.entries.getById.useQuery({ id: entryId });
  const deleteEntry = api.entries.delete.useMutation();

  return <EntryCard entry={entry} onDelete={() => deleteEntry.mutate({ id: entryId })} />;
}
```

**なぜ分けるか**: テストしやすい（Presentationalは純粋関数）、再利用しやすい、責務が明確。

---

## エラーハンドリング: TRPCError

```typescript
// Service内でエラーをスロー
if (!entry) {
  throw new TRPCError({
    code: 'NOT_FOUND',
    message: 'エントリが見つかりません',
  });
}

// Client側でキャッチ
const mutation = api.entries.update.useMutation({
  onError: (error) => {
    if (error.data?.code === 'NOT_FOUND') {
      toast.error('エントリが見つかりません');
    }
  },
});
```

---

## 関連ページ

- [データフロー](data-flow.md)
- [ツール連携](tools.md)
- [エラーパターン](error-patterns.md)

---

**最終更新**: 2026-04-01 | **バージョン**: v1.1
