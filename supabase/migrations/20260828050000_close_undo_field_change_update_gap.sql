-- #2434 fix round P3（指揮台のdelta re-review指摘、2026-08-28、merge非ブロック）。
--
-- 20260828040000で敷いた enforce_undo_field_change_applicability trigger は
-- BEFORE INSERT のみで、UPDATE で field_name を書き換える経路には及ばなかった
-- （trigger自身のCOMMENTは「RPC経由以外の直接INSERT（例: service_roleの直接DML）
-- でも閉じる」と謳っていたが、UPDATE 経路が漏れていた）。
--
-- undo_receipt_field_changes には UPDATE policy が無く、通常経路（RPC）は
-- field_name を書き換えない（record_undo_receipt_v1はINSERTのみ）ため実害は
-- 現時点でゼロだが、service_role の直接 UPDATE で resource_type と矛盾する
-- field_name へ書き換えられる余地は塞いでおく（class ごと閉じる）。

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP TRIGGER enforce_undo_field_change_applicability ON public.undo_receipt_field_changes;

CREATE TRIGGER enforce_undo_field_change_applicability
  BEFORE INSERT OR UPDATE ON public.undo_receipt_field_changes
  FOR EACH ROW EXECUTE FUNCTION private.enforce_undo_field_change_applicability_v1();

COMMENT ON TRIGGER enforce_undo_field_change_applicability ON public.undo_receipt_field_changes IS
  '#2434 P2/P3: field_nameがeffectのresource_typeに実在する列であることをINSERT/UPDATE時に強制する。RPC経由以外の直接DML（例: service_roleの直接INSERT/UPDATE）でも閉じる。';

COMMIT;
