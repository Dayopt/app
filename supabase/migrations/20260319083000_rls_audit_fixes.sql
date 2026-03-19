-- ============================================================
-- RLS監査対応: attachments UPDATE + soft-delete関連テーブルフィルタ
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. attachments ストレージ: UPDATE ポリシー追加
--    avatars には存在するが attachments に欠落していた
-- ────────────────────────────────────────────────────────────
CREATE POLICY "Users can update own attachments" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

-- ────────────────────────────────────────────────────────────
-- 2. entry_tags SELECT: soft-deleted entries のタグを除外
--    entries.deleted_at IS NULL の場合のみ返す
-- ────────────────────────────────────────────────────────────
DROP POLICY "Users can view own plan_tags" ON public.entry_tags;
CREATE POLICY "Users can view own plan_tags" ON public.entry_tags
  FOR SELECT USING (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.entries
      WHERE entries.id = entry_tags.entry_id
        AND entries.deleted_at IS NULL
    )
  );

-- ────────────────────────────────────────────────────────────
-- 3. entry_instances SELECT: soft-deleted entries のインスタンスを除外
-- ────────────────────────────────────────────────────────────
DROP POLICY "Users can view own plan instances" ON public.entry_instances;
CREATE POLICY "Users can view own plan instances" ON public.entry_instances
  FOR SELECT USING (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.entries
      WHERE entries.id = entry_instances.entry_id
        AND entries.deleted_at IS NULL
    )
  );
