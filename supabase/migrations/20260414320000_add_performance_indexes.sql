-- 20260409000000 の CONCURRENTLY をリモートpush用に除去した版

CREATE INDEX IF NOT EXISTS idx_entries_user_start_not_deleted
  ON public.entries(user_id, start_time)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entry_tags_user_tag
  ON public.entry_tags(user_id, tag_id);
