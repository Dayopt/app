---
status: frozen
date: 2026-07-21
code: apps/product/src/lib/database/generated/database.types.ts
---

# Supabase型生成がstripe_webhook_events.statusのCHECK制約リテラルユニオンを推論しない

`pnpm types:generate`（`supabase gen types typescript --project-id ...`）を実行すると`stripe_webhook_events.status`の型がcommit済みの`'processing' | 'processed' | 'failed'`からstringへ緩む。本番のCHECK制約は正常に存在するため、schemaのdriftではなく生成側のquirk。

---

## 経緯

issue #1541（生成型とas neverキャストの整合）の作業中、副産物として`database.types.ts`の軽微な差分に気づいた。当初は「graphql_publicスキーマの消失」と「status列のリテラルユニオン化（改善）」の2点として報告したが、詳しく検証すると両方とも報告内容が誤っていた。

## 確認した事実

- **graphql_public消失は検証ミスだった**: グローバルのHomebrew版CLIが古かった（2.78.1）。repoは`package.json`で`supabase: 2.109.1`をpinしており、`pnpm types:generate`は`node_modules/.bin/supabase`（2.109.1）を使う。pinされたバージョンで再生成するとcommit済みファイルと完全一致（差分ゼロ）。グローバルCLIは`brew upgrade supabase`で2.109.1へ更新済み
- **status列は逆に、commit済みファイルの方が正しい**: 本番へ直接SQL照会し、`stripe_webhook_events_status_check: CHECK ((status = ANY (ARRAY['processing'::text, 'processed'::text, 'failed'::text])))`が存在し`convalidated: true`であることを確認した。にもかかわらず`supabase gen types typescript`（pin済み2.109.1でも再現）はこの列をstringへ生成する
- CLIバージョンに依存しない現象（2.78.1でも2.109.1でも同じ結果）。Supabase側のhosted生成エンドポイントの挙動と推定されるが、原因は未特定（PostgRESTのschema cacheラグ等を疑ったが未検証）

## 学び

`pnpm types:generate`を実行して生成物をcommitする前に、`stripe_webhook_events.status`が`string`へregressionしていないか手動で確認すること。この列に限らず、CHECK制約由来のリテラルユニオンを持つ列を将来追加した場合も同様の確認が必要になりうる。

## 再評価条件

Supabase CLIの将来バージョンでこの列が正しく生成されるようになったら、本noteは役目を終える。他の列でも同様の欠落が見つかった場合は、影響列を洗い出した上でSupabaseへの問い合わせや代替の生成方法を検討する。
