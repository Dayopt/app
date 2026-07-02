---
status: current
last_verified: 2026-07-02
---

# API バリデーション

DayoptにおけるZod + tRPCによる型安全なAPIバリデーションシステムの解説。

---

## システム構成

- **tRPC**: エンドツーエンド型安全 API
- **Zod**: ランタイムスキーマバリデーション
- **TanStack Query**: クライアント状態管理・キャッシュ

```
src/
├── server/api/              # tRPC サーバー設定
│   ├── root.ts             # メインルーター
│   ├── trpc.ts             # tRPC設定・ミドルウェア
│   └── routers/            # 各ルーター
├── schemas/api/            # Zod スキーマ定義
│   ├── common.ts           # 共通スキーマ
│   └── tasks.ts            # タスクスキーマ
└── lib/
    └── api/
        └── error-handler.ts # エラーハンドリング
```

---

## 基本的な使い方

### 1. API定義（サーバー側）

```typescript
export const tasksRouter = createTRPCRouter({
  create: protectedProcedure
    .input(createTaskInputSchema) // Zod自動バリデーション
    .output(taskOutputSchema) // 出力型保証
    .mutation(async ({ input, ctx }) => {
      const task = await createTask(input);
      return task;
    }),
});
```

### 2. スキーマ定義

```typescript
// src/schemas/api/tasks.ts
export const createTaskInputSchema = taskBaseSchema
  .omit({ status: true })
  .extend({
    dueDate: z.date().min(new Date(), '期限は現在時刻以降を指定してください').optional(),
  })
  .refine(
    (data) => {
      if (data.parentTaskId && !data.projectId) return false;
      return true;
    },
    {
      message: '親タスクがある場合はプロジェクトも指定してください',
      path: ['projectId'],
    },
  );
```

### 3. クライアント側使用

```typescript
function TaskForm() {
  const { create } = useTaskOperations();

  const handleSubmit = (data: CreateTaskInput) => {
    create.mutate(data, {
      onSuccess: (task) => {
        /* 成功処理 */
      },
      onError: (error) => {
        /* エラー処理 */
      },
    });
  };
}
```

---

## スキーマ設計パターン

### 1. 基本スキーマ

```typescript
export const taskBaseSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  priority: prioritySchema,
  status: statusSchema,
  dueDate: futureDateSchema.optional(),
  estimatedHours: z.number().min(0.1).max(1000).optional(),
});
```

### 2. 入力スキーマ（作成・更新）

```typescript
// 作成用（一部フィールド除外・追加バリデーション）
export const createTaskInputSchema = taskBaseSchema.omit({ status: true }).extend({
  dueDate: z.date().min(new Date()).optional(),
});

// 更新用（全フィールド任意・条件バリデーション）
export const updateTaskInputSchema = taskBaseSchema
  .partial()
  .extend({ id: idSchema })
  .refine((data) => {
    if (data.completed === true) {
      return data.progress === 100 || data.progress === undefined;
    }
    return true;
  });
```

### 3. 出力スキーマ

```typescript
export const taskOutputSchema = taskBaseSchema.extend({
  id: idSchema,
  completed: z.boolean(),
  ...metadataSchema.shape,
});
```

### 4. 型の再利用

```typescript
export type Task = z.infer<typeof taskSchema>;
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;
```

---

## ベストプラクティス

### エラーメッセージの日本語化

```typescript
z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内で入力してください');
```

### バリデーションの分離

```typescript
export function validateTaskTitle(title: string): boolean {
  return titleSchema.safeParse(title).success;
}
```

### 楽観的更新

```typescript
const updateTask = trpc.tasks.update.useMutation({
  onMutate: async (updateData) => {
    await utils.tasks.list.cancel();
    const previousTasks = utils.tasks.list.getData();

    utils.tasks.list.setData(previousTasks, (old) => ({
      ...old,
      tasks: old.tasks.map((task) =>
        task.id === updateData.id ? { ...task, ...updateData } : task,
      ),
    }));

    return { previousTasks };
  },
  onError: (error, updateData, context) => {
    if (context?.previousTasks) {
      utils.tasks.list.setData(context.previousTasks, context.previousTasks);
    }
  },
});
```

---

## トラブルシューティング

### Transform後のスキーマでメソッドが使用できない

```typescript
// ❌ 問題のあるコード
const schema = z
  .string()
  .transform((val) => val.trim())
  .min(1);

// ✅ 正しいコード（メソッドをtransformの前に）
const schema = z
  .string()
  .min(1)
  .transform((val) => val.trim());
```

### UUIDバリデーションエラー

```typescript
// テストでは有効なUUIDを使用
const testId = '550e8400-e29b-41d4-a716-446655440000';
```

### 日付バリデーションの不一致

```typescript
// 共通スキーマを使用して一貫性確保
import { futureDateSchema } from '@/schemas/api/common';
```

---

## テスト戦略

### スキーマバリデーションテスト

```typescript
describe('タスクスキーマバリデーション', () => {
  it('正常なデータが検証をパスする', () => {
    const validInput: CreateTaskInput = {
      title: '新しいタスク',
      priority: 'medium',
    };
    expect(createTaskInputSchema.safeParse(validInput).success).toBe(true);
  });

  it('無効なデータで検証が失敗する', () => {
    const invalidInput = { title: '' };
    const result = createTaskInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });
});
```

### API統合テスト

```typescript
describe('tRPC API統合テスト', () => {
  it('タスク作成APIが正常に動作する', async () => {
    const caller = tasksRouter.createCaller(mockContext);
    const result = await caller.create({
      title: 'テストタスク',
      priority: 'high',
    });
    expect(result.id).toBeDefined();
  });
});
```

---

## 関連ページ

- [エラーパターン](error-patterns.md)
- [設計パターン](design-patterns.md)

---

**最終更新**: 2026-02-12 | **バージョン**: v1.0
