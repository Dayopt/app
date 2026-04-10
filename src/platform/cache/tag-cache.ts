/**
 * ユーザーのタグリストキャッシュタグを取得
 *
 * @param userId - ユーザーID
 * @returns キャッシュタグ文字列（revalidateTag用）
 */
export function getUserTagsCacheTag(userId: string): string {
  return `user-tags-${userId}`;
}
