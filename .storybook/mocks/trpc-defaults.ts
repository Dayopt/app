/**
 * tRPC グローバルデフォルトモック
 *
 * 全Storyに自動適用されるモックレスポンス。
 * Story個別の parameters.trpcMocks はこれとマージされ、同じキーは上書きされる。
 */

import type { MockResponseMap } from './trpc';

/** Storybook用モックデータ: プリセットタグ */
const MOCK_TAGS = [
  {
    id: 'tag-work',
    name: 'Work',
    color: 'blue',
    icon: null,
    user_id: null,
    is_active: true,
    sort_order: 0,
    created_at: null,
    updated_at: null,
  },
  {
    id: 'tag-learning',
    name: 'Learning',
    color: 'green',
    icon: null,
    user_id: null,
    is_active: true,
    sort_order: 1,
    created_at: null,
    updated_at: null,
  },
  {
    id: 'tag-life',
    name: 'Life',
    color: 'amber',
    icon: null,
    user_id: null,
    is_active: true,
    sort_order: 2,
    created_at: null,
    updated_at: null,
  },
  {
    id: 'tag-exercise',
    name: 'Exercise',
    color: 'teal',
    icon: null,
    user_id: null,
    is_active: true,
    sort_order: 3,
    created_at: null,
    updated_at: null,
  },
  {
    id: 'tag-hobby',
    name: 'Hobby',
    color: 'violet',
    icon: null,
    user_id: null,
    is_active: true,
    sort_order: 4,
    created_at: null,
    updated_at: null,
  },
];

/** 全Storyに自動適用されるデフォルトモックレスポンス */
export const DEFAULT_TRPC_MOCKS: MockResponseMap = {
  'tags.list': { data: MOCK_TAGS },
};
