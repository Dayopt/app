/**
 * tRPC グローバルデフォルトモック
 *
 * 全Storyに自動適用されるモックレスポンス。
 * Story個別の parameters.trpcMocks はこれとマージされ、同じキーは上書きされる。
 */

import type { MockResponseMap } from './trpc';

/**
 * 全Storyに自動適用されるデフォルトモックレスポンス。
 *
 * tags feature 撤去（tag-model-replacement Step 5/7）に伴い、旧 `tags.list` の
 * プリセットモックは削除した。現在グローバルデフォルトを持つ procedure は無く、
 * 個別 Story の `parameters.trpcMocks` だけで賄う。
 */
export const DEFAULT_TRPC_MOCKS: MockResponseMap = {};
