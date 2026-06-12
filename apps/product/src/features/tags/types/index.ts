// タグシステムの型定義（Canonical source）

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

// タグ削除戦略
export type TagDeleteStrategy = 'delete_entries' | 'reassign';
