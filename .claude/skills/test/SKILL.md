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
apps/product/src/features/{feature}/
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

## 実行環境（node / happy-dom）

`apps/product` の unit test は **2 つの project に分かれる**。全 test に happy-dom を掛けると
実行時間の大半が DOM 構築とモジュール読み込みに消えるため（CI 実測でテスト本体は全体の 5%）、
**既定は `node`** で、DOM が要るものだけ happy-dom に入れる。

| project    | 環境        | 対象                                                          | setup           |
| ---------- | ----------- | ------------------------------------------------------------- | --------------- |
| `unit`     | `node`      | 上記以外の `*.test.ts`（domain / service / lib の純ロジック） | `setup-node.ts` |
| `unit-dom` | `happy-dom` | `*.test.tsx`、`use*.test.ts`、明示列挙した例外                | `setup.ts`      |

- **component / hook の test は自動で happy-dom 側に入る**（`.tsx` と `use*` の 2 パターン）。
  普通に書いていれば意識しなくてよい
- **上の 2 パターンに当てはまらない test で DOM が要る場合**は、`apps/product/vitest.config.ts`
  の `DOM_ONLY_TESTS` に path を追加する
- **分類が合っているかはローカルで判断しない。** Node 22 以降は `localStorage` をネイティブに
  持つため、`environment: 'node'` でも web storage が使えてしまい、**ローカルでは通るのに CI
  （Node 24）で `ReferenceError: localStorage is not defined` になる**。分類を変えたら CI を
  oracle にする（2026-08-05 に実際に踏んだ）
- **DOM 依存は test を読んでも分からないことがある。** test 本体が localStorage に触れて
  いなくても、**実装側**が触っていれば DOM が要る。迷ったら DOM 側に置く（遅くなるだけで壊れない）
- **module mock（`server-only` / `next/navigation` / `next-intl`）は両 project 共通**。
  追加する時は `src/lib/test/setup-node.ts` に書く（`setup.ts` はこれを import している）。
  `setup.ts` にだけ足すと node 側の test が静かに素の実装を掴む

## テスト実行コマンド

```bash
# 単一ファイル
pnpm test -- path/to/file.test.ts

# 特定のディレクトリ（pnpm test は apps/product 内で vitest を起動するため package-relative）
pnpm test -- src/features/calendar/

# 全体
pnpm test

# ウォッチモード
pnpm test -- --watch
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

## Assert 対象の規約（正本）

**対象操作後にだけ生じるユーザー可視の結果または永続状態を assert する。** 操作前から存在する要素、generic な alert / class、または発火していない mock を確認しただけで test が成功すると、本番では対象操作が失敗しても回帰を検出できない（failure scenario）。

- network mock は login / render / cache warm より前に登録し、必要なら request の発生と最終 UI の両方を確認する
- **例外**: pure function の unit test など、入力と直接の返り値だけで契約を完全に証明できる場合はこの限りでない

この規約は `AGENTS.md` の TEST-1（凍結前の定義）を踏襲しているが、**この skill が生きた正本**。`AGENTS.md` 側は変更しない。`.claude/rules/workflow.md` §教訓コメント方式 の回帰テスト言及もここを参照する。

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

- [ ] `pnpm test` が通るか
- [ ] 新しいテストが既存テストを壊していないか

## 関連スキル

- `/error-handling` - エラー処理のテスト
- `/storybook` - UIコンポーネントのビジュアルテスト
