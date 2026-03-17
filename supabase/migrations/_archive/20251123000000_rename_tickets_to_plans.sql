-- Migration: Rename tickets to plans
-- Description: 安全にテーブル名とカラム名を tickets → plans に変更
-- Date: 2025-11-23

-- =====================================================
-- Step 1: テーブル名の変更
-- =====================================================

-- tickets テーブルを plans にリネーム
ALTER TABLE IF EXISTS tickets RENAME TO plans;

-- =====================================================
-- Step 2: カラム名の変更
-- =====================================================

-- plan_number は既に存在するため、存在確認してからリネーム
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plans' AND column_name = 'ticket_number'
  ) THEN
    ALTER TABLE plans RENAME COLUMN ticket_number TO plan_number;
  END IF;
END
$$;

-- =====================================================
-- Step 3: シーケンスの名前変更
-- =====================================================

-- plan_number のシーケンスがあれば plan_number に変更
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'tickets_ticket_number_seq'
  ) THEN
    ALTER SEQUENCE tickets_ticket_number_seq RENAME TO plans_plan_number_seq;
  END IF;
END
$$;

-- =====================================================
-- Step 4: 関連テーブルの変更
-- =====================================================

-- plan_tags テーブルを plan_tags にリネーム（存在確認）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'ticket_tags'
  ) THEN
    ALTER TABLE ticket_tags RENAME TO plan_tags;
  END IF;
END
$$;

-- plan_tags の plan_id カラムを plan_id にリネーム（存在確認）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plan_tags' AND column_name = 'ticket_id'
  ) THEN
    ALTER TABLE plan_tags RENAME COLUMN ticket_id TO plan_id;
  END IF;
END
$$;

-- plan_activities テーブルを plan_activities にリネーム（存在確認）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'ticket_activities'
  ) THEN
    ALTER TABLE ticket_activities RENAME TO plan_activities;
  END IF;
END
$$;

-- plan_activities の plan_id カラムを plan_id にリネーム（存在確認）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plan_activities' AND column_name = 'ticket_id'
  ) THEN
    ALTER TABLE plan_activities RENAME COLUMN ticket_id TO plan_id;
  END IF;
END
$$;

-- =====================================================
-- Step 5: インデックスの再作成（自動でリネームされるが念のため確認）
-- =====================================================

-- インデックス名は自動的に更新されるため、特別な操作は不要
-- PostgreSQL はテーブル名変更時に関連インデックスも自動でリネームする

-- =====================================================
-- Step 6: 外部キー制約の確認（自動でリネームされる）
-- =====================================================

-- 外部キー制約も自動的に更新されるため、特別な操作は不要

-- =====================================================
-- Step 7: RLS ポリシーの再作成
-- =====================================================

-- plans テーブルの RLS ポリシー（plans から継承）
-- 既存のポリシーは自動的に plans テーブルに適用される

-- =====================================================
-- Step 8: トリガーの確認
-- =====================================================

-- トリガーも自動的に plans テーブルに移行される

-- =====================================================
-- Step 9: 権限の再付与
-- =====================================================

-- 既存の権限は自動的に plans テーブルに継承される

-- =====================================================
-- 完了メッセージ
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration completed successfully: tickets → plans';
  RAISE NOTICE 'Tables renamed: tickets → plans, plan_tags → plan_tags, plan_activities → plan_activities';
  RAISE NOTICE 'Columns renamed: plan_number → plan_number, plan_id → plan_id';
END
$$;
