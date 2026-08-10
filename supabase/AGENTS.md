# Supabase Code Review Rules

このファイルの追加規則は `supabase/` 配下の変更にだけ適用する。通常の不具合レビューは維持し、ルート `AGENTS.md` の高精度方針に従って各規則の適用条件に該当する場合だけ以下を追加確認する。

## DB-1: RLS・policy・GRANT・snapshot

- **適用条件**: table、view、RPC、RLS policy、GRANT、またはRealtime publicationを追加・変更した場合。
- **Failure scenario**: view / RPC のGRANTやsecurity属性がtableのpolicyを迂回して別ユーザーのデータへ到達する、必要なpolicy/grantを欠いて本番操作が全拒否される、またはsnapshot未更新で有効権限のdriftをレビューできない。
- **Safe path**: RLS、policy、`anon` / `authenticated` / `service_role` のGRANTを1セットで明示し、該当するRLS snapshot・生成物を同じ変更で更新する。Realtime追加時は購読対象とRLS意図も確認する。
- **例外**: access boundaryに影響しないcomment等のmetadata変更。snapshot生成対象外なら、その根拠が既存設定から確認できる場合。

## DB-2: SECURITY DEFINER

- **適用条件**: `SECURITY DEFINER` functionを追加または変更した場合。
- **Failure scenario**: 任意のauthenticated userが他ユーザーのIDを渡して所有権を越える、`search_path` hijackで攻撃者のobjectを実行する、またはPUBLIC EXECUTEにより想定外のcallerへ昇格権限を公開する。
- **Safe path**: session由来のcallerと対象resourceの所有権をfunction内で検証し、固定 `search_path` を設定する。PUBLIC権限をrevokeし、必要なroleにだけ明示GRANTする。
- **例外**: PRで変更していないextension管理function、またはelevated privilegeを持たない `SECURITY INVOKER` function。

## DB-3: 破壊的migration

- **適用条件**: DROP、rename、型や制約の縮小、不可逆なbackfillなど、旧コードまたは既存データと互換性のないmigrationを追加した場合。
- **Failure scenario**: rolling deployment中に旧コードが削除済みfunction/columnを呼び500になる、backfillで値を失う、またはrollback不能な変更を一段で適用して復旧できない。
- **Safe path**: expand → 新旧互換コードのdeploy → productionでの静穏確認 → contractの順に分離し、実行前にrollback手段または復元可能なbackupを用意する。
- **例外**: 既存caller・保存データ・公開契約に影響しない純粋にadditiveなmigration。
