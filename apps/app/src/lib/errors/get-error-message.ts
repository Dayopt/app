/**
 * 不明なエラーからメッセージを抽出するヘルパー
 *
 * catch ブロックで受け取る unknown 型のエラーを安全に文字列に変換
 *
 * @example
 * try {
 *   await someAsyncOperation()
 * } catch (error) {
 *   const message = getErrorMessage(error)
 *   toast.error(message)
 * }
 */
export function getErrorMessage(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return fallback;
}
