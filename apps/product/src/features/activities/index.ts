/**
 * Activities Feature - Public API
 *
 * migration: supabase/migrations/20260818120000_add_activity_category_tables.sql
 *
 * Category / Activity 機能の統一的なエントリーポイント。
 * 外部からのインポートはこのファイル経由で行う。
 *
 * server 層（router / service）は app-router.ts からのみ import する
 * （tags と同じく barrel から export しない）。
 */

// Types
export type { Activity, ActivityTree, Category, CategoryTreeNode } from './types';

// ここにないものはfeature内部専用
