-- バッジ機能の廃止に伴う user_badges テーブル削除
-- launch 前のため data 損失は許容。アプリ側の badges feature / tRPC / i18n も同時に削除済み。

DROP TABLE IF EXISTS public.user_badges;
