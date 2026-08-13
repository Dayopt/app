-- =============================================================================
-- API 層の write fence（tRPC mutation + webhook）を制御する singleton gate
-- =============================================================================
--
-- mcp_mutation_control（20260729062445_mcp_mutation_envelope_foundation.sql）と
-- 同じ singleton pattern。ただし本テーブルは toggle 用 RPC を持たない —
-- app runtime（authenticated / service_role のいずれも）に UPDATE 権限を
-- 与えると、compromised runtime やバグが自己解除できてしまうため、toggle は
-- Dashboard SQL Editor（postgres superuser、GRANT の対象外）からの直接
-- UPDATE に限定する。CAS/revision 列も持たない — 並行 writer が存在しない
-- 運用（人間が 1 人で SQL を打つ）なので lost update の相手がいない。

CREATE TABLE public.write_fence_control (
  singleton_key BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton_key),
  fence_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

INSERT INTO public.write_fence_control (singleton_key, fence_enabled)
VALUES (true, false);

COMMENT ON TABLE public.write_fence_control IS
  'Singleton write fence for API-layer writes (tRPC mutations + webhooks). '
  'isWriteFenceEnabled() fails closed on any read error or missing row. '
  'Toggle via Dashboard SQL Editor UPDATE only — no application-level write grant exists.';

-- 既存の updated_at トリガー関数（public.update_updated_at）を再利用する。
-- Dashboard から手打ちで UPDATE しても updated_at の更新漏れが起きない。
CREATE TRIGGER trigger_update_write_fence_control_updated_at
  BEFORE UPDATE ON public.write_fence_control
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.write_fence_control ENABLE ROW LEVEL SECURITY;

-- fence_enabled は真偽値 1 個で秘匿性が無く、mutation が 503 を返す時点で
-- クライアントには状態が露出する。SELECT を authenticated と service_role の
-- 両方へ開ける — tRPC mutation は ctx.supabase（authenticated）で読み、
-- webhook は service role client で読む。呼び出し元ごとに読み取り経路を
-- 分けることで、fence の読み取り失敗が「その書き込みが実際に使う経路の
-- 失敗」と一致し、fail-closed が新しい単一障害点にならない。
REVOKE ALL ON TABLE public.write_fence_control FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.write_fence_control TO authenticated, service_role;

CREATE POLICY "write_fence_control_select" ON public.write_fence_control
  FOR SELECT
  TO authenticated, service_role
  USING (true);
