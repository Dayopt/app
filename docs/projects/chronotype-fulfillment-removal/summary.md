---
status: current
last_verified: 2026-07-16
code:
  - apps/product/src/features/timeblock
  - apps/product/src/features/calendar
  - apps/product/src/lib/database/generated/database.types.ts
  - packages/domain
  - packages/foundations
  - supabase/migrations/20260716022141_drop_chronotype_fulfillment_columns.sql
---

# chronotype-fulfillment-removal 完了サマリー

Chronotype と FulfillmentScore は、2026-07-16 に application contract と production DB schema の両方から削除した。Dayopt の現在機能・将来候補・互換資産としては扱わない。

## 最終契約

- Record、Settings、Calendar、statistics、JSON / CSV export、MCP は `fulfillment_score` / `chronotype_settings` を読み書きせず、応答にも含めない
- `public.records.fulfillment_score` と `public.user_settings.chronotype_settings` は存在しない
- canonical schema、生成型、RPC composite return、seed / fixture に両 field は存在しない
- Chronotype domain、chronotype / fulfillment design token、Storybook / Eagle taxonomy、現行ユーザー向け docs に専用資産は存在しない
- 一般的な生体リズムや心理学研究を扱う editorial content、適用済み migration、frozen log は履歴として残す

## Production 適用結果

1. #1630 で `/api/health` の不正な memory readiness gate と存在しない `ping` RPCを修復し、productionで逐次20回・並列20回の全件 `healthy` を確認した
2. drop直前にproductionの非null値を `fulfillment_score=1件`、`chronotype_settings=2件` と再確認し、承認上限を超えていないことを確認した
3. PR #1635 のmigrationをSupabase GitHub integrationで適用した。migrationはtable lock後に件数上限を再検査し、`CASCADE` / `IF EXISTS` を使わず既定の `RESTRICT` で両columnを削除した
4. production catalogでcolumn、column-owned check / indexの不在とmigration historyを確認した
5. 適用後もhealthは逐次20回・並列20回の全件がHTTP 200 / `healthy` で、503は0件だった
6. productionのCalendar、Settings、37件のRecordを含むJSON exportで両キーが0件であることを確認した。MCPの `records.list` / `entries.list` は同じ公開経路を使うnon-empty回帰テストで確認した
7. VercelとSentryで対象列の参照error / fatalが0件、Supabase security advisorが0件であることを確認した。performance advisorには今回のdrop由来の新規指摘はなかった
8. productionから型を再生成し、対象キーが存在せず、現行PostgREST version metadataを含む出力とrepositoryを一致させた

## 不可逆性

削除した3件の値はbackupや代替指標へ移行しておらず、復元できない。これはPhase 1でruntimeと公開契約から利用を停止した後、ユーザーが既存値の破棄とproduction適用を承認し、transaction内の件数上限guardで承認後の増加を保護した上で実施した。

## 参照

- [全体設計](./overview.md)
- [GitHub Issue #1625](https://github.com/Dayopt/dayopt/issues/1625)
- [Health修復 Issue #1630](https://github.com/Dayopt/dayopt/issues/1630)
- [Schema drop PR #1635](https://github.com/Dayopt/dayopt/pull/1635)
