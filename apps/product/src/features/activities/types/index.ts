// Activity / Category の型定義（Canonical source）
//
// migration: supabase/migrations/20260818120000_add_activity_category_tables.sql
// 単一所属は Activity.category_id 1 本で表現する（中間テーブルなし）。
// tags の parent_id / is_active に相当する概念は存在しない
// （階層なし、is_active に相当する「マージ済みの墓標」も無い）。

export interface Category {
  id: string;
  name: string;
  user_id: string;
  /** 10色固定パレットのいずれか。null = 未設定 */
  color: string | null;
  /** Lucideアイコン名（例: "briefcase"）。null = 色ドットにフォールバック */
  icon: string | null;
  /** アーカイブ日時。null = 通常。セット済みは新規 Activity の候補に出さない */
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  name: string;
  user_id: string;
  /** 所属カテゴリー ID。null = 未分類 */
  category_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/** サイドバー用スナップショット: カテゴリーごとの所属 Activity + 未分類 Activity */
export interface CategoryTreeNode {
  category: Category;
  activities: Activity[];
}

export interface ActivityTree {
  categories: CategoryTreeNode[];
  /** category_id が null の Activity */
  uncategorized: Activity[];
}
