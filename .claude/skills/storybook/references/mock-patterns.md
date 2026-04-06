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

`trpcMocks` は `.storybook/mocks/trpc-defaults.ts` の `DEFAULT_TRPC_MOCKS`（`tags.list` 等）と自動マージされる。同じキーは上書き。

### StoryTRPCProvider で直接ラップ

AllPatterns 内で複数状態を並べる場合に使用。

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

### 登録済みストア（.storybook/mocks/stores.ts）

| キー                         | ストア                   |
| ---------------------------- | ------------------------ |
| `useAuthStore`               | 認証ストア               |
| `useCalendarFilterStore`     | タグフィルターストア     |
| `useCalendarNavigationStore` | カレンダーナビゲーション |
| `useCalendarSettingsStore`   | カレンダー設定           |
| `useModalStore`              | モーダルストア           |

新しいストアを追加する場合は `STORE_REGISTRY` に登録する。

---

## プリセット（.storybook/mocks/presets.ts）

Story 間で共通のモックデータ。

| プリセット                     | 内容                                           |
| ------------------------------ | ---------------------------------------------- |
| `PRESET_TAGS.standard`         | 5タグ（Work, Learning, Life, Exercise, Hobby） |
| `PRESET_TAGS.empty`            | 空配列                                         |
| `PRESET_USER_SETTINGS.default` | 標準設定（24h, Asia/Tokyo, 月曜始まり）        |
| `PRESET_AUTH.authenticated`    | 認証済みユーザー（useAuthStore用）             |
| `PRESET_AUTH.unauthenticated`  | 未認証状態                                     |
| `PRESET_AUTH.noEmail`          | メールなしユーザー                             |

```tsx
import { PRESET_AUTH, PRESET_USER_SETTINGS } from '../../../.storybook/mocks/presets';
```

---

## 旧パターンからの移行

### Before（40行のボイラープレート）

```tsx
// 各Storyファイルに重複
function createMockLink(responseMap) { ... }
function createPendingLink() { ... }
function MockProvider({ children, responseMap, pending }) { ... }

const meta = {
  decorators: [(Story) => <MockProvider responseMap={...}><Story /></MockProvider>],
};
```

### After（parameters 宣言のみ）

```tsx
const meta = {
  parameters: {
    trpcMocks: { 'userSettings.get': PRESET_USER_SETTINGS.default },
    storeMocks: { useAuthStore: PRESET_AUTH.authenticated },
  },
};

export const Loading: Story = {
  parameters: { trpcPending: true },
};
```
