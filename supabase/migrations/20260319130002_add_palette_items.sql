-- ============================================================
-- パレットアイテム（よく使うブロックのクイック配置）
-- ============================================================

CREATE TABLE public.palette_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT palette_items_unique_combo UNIQUE(user_id, tag_id, duration_minutes)
);

-- RLS
ALTER TABLE palette_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own palette items"
  ON palette_items FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own palette items"
  ON palette_items FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own palette items"
  ON palette_items FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own palette items"
  ON palette_items FOR DELETE USING (auth.uid() = user_id);

-- インデックス
CREATE INDEX idx_palette_items_user ON palette_items(user_id);

-- updated_at トリガー
CREATE TRIGGER trigger_update_palette_items_updated_at
  BEFORE UPDATE ON public.palette_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
