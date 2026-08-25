# モックパターン API リファレンス

## tRPC モック

### parameters で宣言（推奨）

Story の `parameters` に指定するだけで、グローバルデコレータが自動適用。

```tsx
// データ指定
parameters: {
  trpcMocks: { 'userSettings.get': PRESET_USER_SETTINGS.default },
}

// ローディング（全クエリがペンディング）
parameters: { trpcPending: true }

// エラー（特定パスにエラーを返す）
parameters: {
  trpcError: { path: 'userSettings.get', code: 'INTERNAL_SERVER_ERROR' },
}
```

`trpcMocks` は `.storybook/mocks/trpc-defaults.ts` の `DEFAULT_TRPC_MOCKS`（現状は空。tags feature 撤去に伴い旧 `tags.list` プリセットは削除済みで、個別 Story の `parameters.trpcMocks` だけで賄う）と自動マージされる。同じキーは上書き。

### StoryTRPCProvider で直接ラップ

AllPatterns 内で複数状態を並べる場合に使用。ネストした内側の Provider が外側の providerDecorator の tRPC 層を上書きする。

```tsx
import { StoryTRPCProvider } from '../../../.storybook/mocks/trpc';

export const AllPatterns: Story = {
  render: () => (
    <div className="space-y-12">
      <StoryTRPCProvider mocks={{ 'userSettings.get': data }}>
        <MyComponent />
      </StoryTRPCProvider>
      <StoryTRPCProvider pending>
        <MyComponent />
      </StoryTRPCProvider>
      <StoryTRPCProvider error={{ path: 'userSettings.get', code: 'NOT_FOUND' }}>
        <MyComponent />
      </StoryTRPCProvider>
    </div>
  ),
};
```

### エクスポート API（.storybook/mocks/trpc.tsx）

| エクスポート                  | 用途                                    |
| ----------------------------- | --------------------------------------- |
| `StoryTRPCProvider`           | Story用プロバイダ（毎回新 QueryClient） |
| `createMockLink(mocks)`       | カスタムリンク生成（高度な用途）        |
| `createPendingLink()`         | ローディング維持リンク                  |
| `createErrorLink(path, code)` | エラーリンク                            |
| `MockResponseMap`             | 型: `Record<string, unknown>`           |

`MockResponseMap` は現時点では `Record<string, unknown>` で運用。将来的に router 型から推論する可能性があるが、現状はこのままで良い。型を厳格化しようとしないこと。

`createMockLink` は `StoryTRPCProvider` では対応できないケース（例: カスタム httpBatchLink オプションのテスト）でのみ使用。

---

## Zustand ストアモック

### parameters で宣言（推奨）

```tsx
parameters: {
  storeMocks: {
    useAuthStore: { user: PRESET_AUTH.authenticated.user, loading: false },
    useCalendarFilterStore: { initialized: true },
  },
}
```

Story 切替時に自動リストア。レジストリに登録済みのストアのみ対応。

### 登録済みストア（.storybook/mocks/stores.tsx）

| キー                         | ストア                           |
| ---------------------------- | -------------------------------- |
| `useAuthStore`               | 認証ストア                       |
| `useCalendarFilterStore`     | アクティビティフィルターストア   |
| `useCalendarNavigationStore` | カレンダーナビゲーション         |
| `useShellStore`              | shell UI state（サイドバー幅等） |

新しいストアを追加する場合は `STORE_REGISTRY` に登録する。

---

## プリセット（.storybook/mocks/presets.ts）

Story 間で共通のモックデータ。

| プリセット                     | 内容                                    |
| ------------------------------ | --------------------------------------- |
| `PRESET_USER_SETTINGS.default` | 標準設定（24h, Asia/Tokyo, 月曜始まり） |
| `PRESET_AUTH.authenticated`    | 認証済みユーザー（useAuthStore用）      |
| `PRESET_AUTH.unauthenticated`  | 未認証状態                              |
| `PRESET_AUTH.noEmail`          | メールなしユーザー                      |

```tsx
import { PRESET_AUTH, PRESET_USER_SETTINGS } from '../../../.storybook/mocks/presets';
```
