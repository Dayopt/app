// タグシステムの型定義（Canonical source）

import type { TagColorName } from '../lib/tag-colors';

export interface Tag {
  id: string;
  /** タグ名。親子モデルでは親配下のローカル名を保持する。 */
  name: string;
  user_id: string;
  color: string | null;
  /** Lucideアイコン名（例: "briefcase"）。null = 色ドットにフォールバック */
  icon: string | null;
  is_active: boolean;
  /** 親タグID。null = ルートタグ */
  parent_id: string | null;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface TagTreeNode {
  tag: Tag;
  children: Tag[];
}

// タグ作成用入力型
export interface CreateTagInput {
  name: string;
  color: TagColorName;
  icon?: string;
  parentId?: string | null;
}

// タグ更新用入力型
export interface UpdateTagInput {
  name?: string | undefined;
  color?: TagColorName | undefined;
  icon?: string | null | undefined;
  parentId?: string | null | undefined;
  is_active?: boolean | undefined;
  sort_order?: number | undefined;
}

// タグフィルター用
export interface TagFilter {
  search?: string | undefined;
  is_active?: boolean | undefined;
}

// タグ並び替え用
export type TagSortField = 'name' | 'created_at' | 'usage_count' | 'sort_order';
export type TagSortOrder = 'asc' | 'desc';

export interface TagSortOptions {
  field: TagSortField;
  order: TagSortOrder;
}

// タグ削除戦略
export type TagDeleteStrategy = 'delete_entries' | 'reassign';

// タグ選択用（UI コンポーネントで使用）
export interface TagOption {
  value: string;
  label: string;
  color: string | null;
  icon: string | null;
  disabled?: boolean | undefined;
}
