---
name: test
description: 新機能実装の完了時（tRPC procedure / React hook / pure function / component の新規作成後）、バグ修正の完了時（回帰防止用）、既存テストの assertion 追加が必要になる実装変更時に発動。Vitest + Testing Library の配置規約（`__tests__/*.test.ts`）に従う。型定義のみ・UI 文言のみ・既存テストのリファクタリングのみの変更時は発動しない。
effort: medium
maxTurns: 15
---

# テスト作成スキル

Dayoptのテスト作成を支援するスキル。Vitest + Testing Libraryを使用。

## When to Use

以下の状況で発動:

- 新規 tRPC procedure / service 関数 / React hook / pure function を実装完了した時
- 複雑な状態遷移を持つ component を新規追加した時
- Zod schema の制約を追加・変更した時（入力境界の test case 追加）
- 既存の実装変更で分岐や境界条件が増えた時（未カバーの path が生まれる）
- バグを修正した直後（同じ回帰を検知するテストを追加する）

## When NOT to Use

- 型定義のみの変更（挙動が変わらず、テスト対象の実装が存在しない）
- UI 文言・レイアウトのみの変更（`storybook` skill の視覚検証領域、test 対象外）
- 既存テストのリファクタリング（構造変更のみ、カバレッジは変わらない）

## 技術スタック

| ツール          | 用途                      |
| --------------- | ------------------------- |
| Vitest          | テストランナー            |
| Testing Library | コンポーネントテスト      |
| MSW             | APIモック（必要に応じて） |

## テスト配置ルール

```
src/features/{feature}/
├── components/
│   ├── MyComponent.tsx
│   └── __tests__/
│       └── MyComponent.test.tsx
├── hooks/
│   ├── useMyHook.ts
│   └── __tests__/
│       └── useMyHook.test.ts
└── utils/
    ├── myUtil.ts
    └── __tests__/
        └── myUtil.test.ts
```

## テスト実行コマンド

```bash
# 単一ファイル
npm run test -- path/to/file.test.ts

# 特定のディレクトリ
npm run test -- src/features/calendar/

# 全体
npm run test

# ウォッチモード
npm run test -- --watch
```

## テストパターン

### ユニットテスト（関数）

```typescript
import { describe, it, expect } from 'vitest';
import { formatDate } from '../formatDate';

describe('formatDate', () => {
  it('正常系: 日付をフォーマットする', () => {
    const date = new Date('2024-01-15');
    expect(formatDate(date)).toBe('2024/01/15');
  });

  it('エッジケース: 無効な日付', () => {
    expect(() => formatDate(null as any)).toThrow();
  });
});
```

### コンポーネントテスト

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Button } from '../Button';

describe('Button', () => {
  it('renders correctly', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);

    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

### フックテスト

```typescript
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useCounter } from '../useCounter';

describe('useCounter', () => {
  it('初期値が設定される', () => {
    const { result } = renderHook(() => useCounter(10));
    expect(result.current.count).toBe(10);
  });

  it('incrementで値が増える', () => {
    const { result } = renderHook(() => useCounter(0));

    act(() => {
      result.current.increment();
    });

    expect(result.current.count).toBe(1);
  });
});
```

### Zustand storeテスト

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useMyStore } from '../myStore';

describe('myStore', () => {
  beforeEach(() => {
    // ストアをリセット
    useMyStore.setState({ count: 0 });
  });

  it('初期状態', () => {
    const state = useMyStore.getState();
    expect(state.count).toBe(0);
  });

  it('increment action', () => {
    useMyStore.getState().increment();
    expect(useMyStore.getState().count).toBe(1);
  });
});
```

## テストケース設計

### 3つのカテゴリ

| カテゴリ     | 内容                           | 優先度 |
| ------------ | ------------------------------ | ------ |
| 正常系       | 期待通りの入力                 | 必須   |
| エラー系     | 異常な入力、エラーハンドリング | 必須   |
| エッジケース | 境界値、空配列、null           | 推奨   |

### テストケース例

```typescript
describe('calculateTotal', () => {
  // 正常系
  it('正の数の合計を計算する', () => { ... });

  // エラー系
  it('空配列でエラーを投げる', () => { ... });

  // エッジケース
  it('1要素の配列', () => { ... });
  it('負の数を含む配列', () => { ... });
  it('小数を含む配列', () => { ... });
});
```

## Dayopt固有のパターン

### tRPCエンドポイントのテスト

```typescript
// サービス層を直接テスト
import { createTagService } from '../services/tag';

describe('TagService', () => {
  it('タグを作成する', async () => {
    const mockSupabase = createMockSupabase();
    const service = createTagService(mockSupabase);

    const result = await service.create({
      userId: 'user-1',
      name: 'Test Tag',
    });

    expect(result.name).toBe('Test Tag');
  });
});
```

### カレンダーコンポーネントのテスト

```typescript
// ドラッグ操作のテストは複雑なため、
// ユニットテストは状態管理に集中
describe('useCalendarDrag', () => {
  it('ドラッグ開始で状態が更新される', () => { ... });
  it('ドラッグ終了で状態がリセットされる', () => { ... });
});
```

## 出力形式

```markdown
## テスト作成完了

### 作成したテスト

| ファイル                       | テスト数 | 内容             |
| ------------------------------ | -------- | ---------------- |
| `__tests__/formatDate.test.ts` | 3        | 日付フォーマット |

### カバレッジ

- 正常系: 2件
- エラー系: 1件
- エッジケース: 0件

### 実行結果
```

✓ formatDate > 正常系: 日付をフォーマットする
✓ formatDate > 正常系: 時刻を含む日付
✓ formatDate > エラー系: 無効な日付

```

```

## チェックリスト

テスト作成時：

- [ ] 正常系をカバーしたか
- [ ] エラー系をカバーしたか
- [ ] テストが独立しているか（他のテストに依存しない）

テスト実行時：

- [ ] `npm run test` が通るか
- [ ] 新しいテストが既存テストを壊していないか

## 関連スキル

- `/error-handling` - エラー処理のテスト
- `/storybook` - UIコンポーネントのビジュアルテスト
