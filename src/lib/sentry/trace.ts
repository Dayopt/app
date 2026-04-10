/**
 * カスタムパフォーマンストレースラッパー
 *
 * Sentryのトランザクション計測を簡単に行うためのヘルパー関数
 *
 * 使用例:
 * ```tsx
 * // 非同期処理
 * const result = await withTrace('task-creation', async () => {
 *   return await createTask(taskData)
 * })
 *
 * // 同期処理
 * const result = withTrace('filter-tasks', () => {
 *   return tasks.filter(t => t.status === 'closed')
 * })
 * ```
 */

import * as Sentry from '@sentry/nextjs';

/**
 * パフォーマンストレース設定
 */
interface TraceOptions {
  /**
   * トランザクション名（例: 'task-creation', 'data-fetch'）
   */
  name: string;

  /**
   * 操作タイプ（例: 'db.query', 'http.client', 'function'）
   * @default 'function'
   */
  op?: string;

  /**
   * 追加タグ（分類用）
   */
  tags?: Record<string, string>;

  /**
   * 追加データ（デバッグ用）
   */
  data?: Record<string, unknown>;
}

/**
 * トレース結果
 */
interface TraceResult<T> {
  /** 関数の実行結果 */
  result: T;
  /** 実行時間（ミリ秒） */
  duration: number;
}

/**
 * 非同期関数のパフォーマンス計測
 *
 * @example
 * ```tsx
 * const { result, duration } = await withTrace('fetch-tasks', async () => {
 *   return await api.get('/tasks')
 * }, {
 *   op: 'http.client',
 *   tags: { endpoint: '/tasks' }
 * })
 * ```
 */
export async function withTrace<T>(
  name: string,
  fn: () => Promise<T>,
  options?: Omit<TraceOptions, 'name'>,
): Promise<TraceResult<T>>;

/**
 * 同期関数のパフォーマンス計測
 *
 * @example
 * ```tsx
 * const { result, duration } = withTrace('calculate-total', () => {
 *   return items.reduce((sum, item) => sum + item.price, 0)
 * })
 * ```
 */
export function withTrace<T>(
  name: string,
  fn: () => T,
  options?: Omit<TraceOptions, 'name'>,
): TraceResult<T>;

/**
 * 関数実装（オーバーロード統合）
 */
export function withTrace<T>(
  name: string,
  fn: () => T | Promise<T>,
  options?: Omit<TraceOptions, 'name'>,
): TraceResult<T> | Promise<TraceResult<T>> {
  const startTime = performance.now();

  return Sentry.startSpan(
    {
      name,
      op: options?.op || 'function',
      ...(options?.data || options?.tags
        ? {
            attributes: {
              ...options?.data,
              ...options?.tags,
            } as Record<string, string | number | boolean | undefined>,
          }
        : {}),
    },
    () => {
      // 関数実行
      const resultOrPromise = fn();

      // 非同期の場合
      if (resultOrPromise instanceof Promise) {
        return resultOrPromise
          .then((result) => {
            const duration = performance.now() - startTime;

            // パフォーマンスメトリクスを記録
            Sentry.setMeasurement(`${name}_duration`, duration, 'millisecond');

            return { result, duration };
          })
          .catch((error) => {
            const duration = performance.now() - startTime;

            // エラー時もメトリクスを記録
            Sentry.setMeasurement(`${name}_duration`, duration, 'millisecond');
            Sentry.captureException(error, {
              tags: {
                trace_name: name,
                trace_duration_ms: String(duration),
                trace_operation: options?.op || 'function',
                ...options?.tags,
              },
              extra: {
                duration,
                operation: options?.op || 'function',
                data: options?.data,
              },
            });

            throw error;
          });
      }

      // 同期の場合
      const duration = performance.now() - startTime;
      Sentry.setMeasurement(`${name}_duration`, duration, 'millisecond');

      return { result: resultOrPromise, duration };
    },
  );
}

/**
 * API呼び出しのパフォーマンス計測（ヘルパー）
 *
 * @example
 * ```tsx
 * const tasks = await traceApiCall('GET /tasks', async () => {
 *   return await api.get('/tasks')
 * })
 * ```
 */
export async function traceApiCall<T>(endpoint: string, fn: () => Promise<T>): Promise<T> {
  const { result } = await withTrace(endpoint, fn, {
    op: 'http.client',
    tags: { endpoint },
  });

  return result;
}

/**
 * データベースクエリのパフォーマンス計測（ヘルパー）
 *
 * @example
 * ```tsx
 * const tasks = await traceDbQuery('tasks.findMany', async () => {
 *   return await prisma.task.findMany()
 * })
 * ```
 */
export async function traceDbQuery<T>(queryName: string, fn: () => Promise<T>): Promise<T> {
  const { result } = await withTrace(queryName, fn, {
    op: 'db.query',
    tags: { query: queryName },
  });

  return result;
}

/**
 * React Server Componentのパフォーマンス計測（ヘルパー）
 *
 * @example
 * ```tsx
 * const Component = async () => {
 *   const data = await traceServerComponent('DashboardPage', async () => {
 *     return await fetchDashboardData()
 *   })
 *
 *   return <div>{data}</div>
 * }
 * ```
 */
export async function traceServerComponent<T>(
  componentName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const { result } = await withTrace(`RSC: ${componentName}`, fn, {
    op: 'server-component',
    tags: { component: componentName },
  });

  return result;
}
