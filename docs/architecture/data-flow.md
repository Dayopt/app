import { Mermaid } from '../../../.storybook/decorators/Mermaid';

# データフロー

Dayoptにおけるデータの流れ。ユーザー操作からDBまでの全レイヤーを図解する。

---

## 全体像

<Mermaid chart={`graph TD
User["👤 ユーザー操作"]

    subgraph Client["🖥️ クライアント"]
        RC["React Component"]
        ZS["Zustand Store<br/>(UI状態)"]
        TQ["TanStack Query<br/>(キャッシュ)"]
        TRPC_C["tRPC Client<br/>(httpBatchLink)"]
    end

    subgraph Server["⚙️ サーバー"]
        API["/api/trpc/[trpc]"]
        MW["Middleware<br/>(認証・Rate Limit)"]
        TRPC_R["tRPC Router<br/>(protectedProcedure)"]
        SVC["Service Layer<br/>(ビジネスロジック)"]
    end

    subgraph DB["🗄️ データベース"]
        SB["Supabase Client"]
        PG["PostgreSQL + RLS"]
    end

    User --> RC
    RC <--> ZS
    RC --> TRPC_C
    TRPC_C --> TQ
    TRPC_C -->|"POST (batch)"| API
    API --> MW
    MW --> TRPC_R
    TRPC_R --> SVC
    SVC --> SB
    SB --> PG
    TQ -.->|"refetchOnWindowFocus"| RC

`} />

## 認証フロー

<Mermaid chart={`graph LR
subgraph AuthModes["認証モード（自動判定）"]
S["Session<br/>(Cookie)"]
O["OAuth 2.1<br/>(Bearer Token)"]
SR["Service-Role<br/>(API Key)"]
end

    subgraph Middleware
        CTX["createFetchTRPCContext"]
        RL["Rate Limit<br/>(100 req/min)"]
    end

    S --> CTX
    O --> CTX
    SR --> CTX
    CTX -->|"userId 抽出"| RL
    RL --> Router["tRPC Router"]

`} />

## Provider 階層

<Mermaid
chart={`graph TD
    P["Providers (root)"]
    P --> QC["QueryClientProvider"]
    P --> TC["api.Provider (tRPC)"]
    P --> AS["AuthStoreInitializer"]
    P --> TP["ThemeProvider"]
    P --> SW["ServiceWorkerProvider (lazy)"]
    P --> GT["GlobalTagMergeModal (lazy)"]
`}
/>

## キャッシュ戦略

<Mermaid chart={`graph LR
subgraph Cache["TanStack Query キャッシュ"]
E["entries / calendars<br/>stale: 5min, gc: 10min"]
T["tags<br/>stale: 5min, gc: 10min"]
US["userSettings<br/>stale: 1h, gc: 2h"]
TU["tagUsage<br/>stale: 1min, gc: 5min"]
end

    WF["refetchOnWindowFocus"] -.->|"stale時 再取得"| E
    WF -.->|"stale時 再取得"| T

`} />

## Feature 間の依存（Composition Layer）

<Mermaid chart={`graph TD
subgraph Features
CAL["calendar"]
ENT["entry"]
TAG["tags"]
AUTH["auth"]
STAT["stats"]
SET["settings"]
AI["ai"]
CHRONO["chronotype"]
SEARCH["search"]
ONBOARD["onboarding"]
TOUR["tour"]
CONTACT["contact"]
end

    subgraph Composition["Composition Layer"]
        SHELL["src/shell/"]
        PLAT["src/platform/"]
        COMP["src/components/"]
        STORE["src/stores/"]
        TYPES["src/types/"]
    end

    CAL -->|"hooks"| COMP
    ENT -->|"hooks"| COMP
    TAG --> STORE
    AUTH --> PLAT
    STAT --> STORE
    SET --> STORE
    CHRONO --> TYPES

    SHELL --> CAL
    SHELL --> ENT
    SHELL --> TAG
    SHELL --> SEARCH

`} />

---

## 各レイヤーの役割

### 1. React Component

ユーザー操作を受け取り、tRPC mutationを呼び出す。

```typescript
const handleCreateEntry = async (data) => {
  await createEntry.mutateAsync(data);
};
```

### 2. tRPC Client + TanStack Query

型安全なAPI呼び出しとキャッシュ管理。

```typescript
const createEntry = api.entries.create.useMutation({
  onSuccess: () => {
    utils.entries.list.invalidate(); // キャッシュ無効化→再取得
  },
});
```

**なぜtRPCか**: クライアント↔サーバー間の型安全性、自動補完、REST APIより少ないコード量。

**なぜTanStack Queryか**: サーバーデータのキャッシング、自動リフェッチ、楽観的更新のサポート。

### 3. tRPC Router

入力バリデーションと認証チェック。ルーターは薄く保つ。

```typescript
create: protectedProcedure.input(createEntrySchema).mutation(async ({ ctx, input }) => {
  const service = createEntryService(ctx.supabase);
  return service.create({ userId: ctx.userId, ...input });
});
```

### 4. Service Layer

ビジネスロジックを集約。テストしやすく、再利用可能。

```typescript
class EntryService {
  async create(params) {
    // バリデーション
    // ビジネスロジック
    // DB操作
  }
}
```

**なぜService層を分けるか**: ビジネスロジックの再利用、テストしやすさ、ルーターを薄く保つ。

### 5. Supabase Client

```typescript
const { data, error } = await this.supabase.from('entries').insert(entryData).select().single();
```

### 6. PostgreSQL + RLS

データベースレベルでのセキュリティ。

```sql
CREATE POLICY "Users can manage own entries"
ON entries FOR ALL
USING (auth.uid() = user_id);
```

**なぜRLSか**: アプリケーションコードでの漏れを防ぐ、ゼロトラスト原則。

---

## 状態管理の使い分け

| 状態の種類               | 管理方法       | 例                               |
| ------------------------ | -------------- | -------------------------------- |
| **サーバーデータ**       | TanStack Query | エントリ一覧、タグ               |
| **UI状態（グローバル）** | Zustand        | サイドバー開閉、選択中のアイテム |
| **UI状態（ローカル）**   | useState       | フォームの入力値、モーダルの開閉 |
| **URL状態**              | Next.js Router | 現在のページ、クエリパラメータ   |

詳細は [状態管理](state-management.md) を参照。

---

## 楽観的更新のフロー

```
[ユーザー操作]
     ↓
[キャッシュを即座に更新] ← 体感0ms
     ↓
[tRPC mutation送信]
     ├─ 成功 → キャッシュ確定
     └─ 失敗 → キャッシュをロールバック + toast.error()
```

---

**最終更新**: 2026-03-19 | **バージョン**: v2.0
