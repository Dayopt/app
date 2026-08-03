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
  /** アーカイブ日時。null = 通常。セット済みは新規 Plan / Record の候補に出さない */
  archived_at: string | null;
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
