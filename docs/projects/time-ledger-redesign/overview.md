---
status: active
last_verified: 2026-08-26
code:
  - apps/product/src/features/timeblock
  - apps/product/src/features/activities
  - apps/product/src/features/calendar
  - apps/product/src/features/review
  - apps/product/src/features/external-calendar
  - apps/product/src/app/api/mcp
  - docs/product/principles.md
  - docs/product/specs
---

# time-ledger-redesign — 「時間の台帳」v1 設計正本化と現行仕様との差分裁定

[epic #2394](https://github.com/Dayopt/dayopt/issues/2394) が採用した「2026-08-25 のプロダクト設計書 v1.0」（原本: `/Users/tanakatomoya/Downloads/timebox-ledger-design.md`、327 行、以下「v1.0」）を、Dayopt の実装可能な契約へ翻訳し、現行仕様・実装・ADR との矛盾を明示的に裁定する設計書。[issue #2395](https://github.com/Dayopt/dayopt/issues/2395) の成果物（**大規模判定**。裁定 19 項目、blast radius が timeblock / activities / calendar / review / external-calendar / MCP / OAuth / design token / docs 全域、依存順を issue 本文が拘束）。

本書は #2396〜#2399（契約基盤・第一便・第二便・第三便）の `status:blocked` 解除条件。進捗は各子 epic に置き、本書には裁定の中身と理由だけを書く（`.claude/rules/workflow.md` §issue と docs の分担）。

---

## 1. Goal

v1.0 が提示する「自分の時間の台帳」モデルと、Dayopt の現行データモデル・仕様・公開契約との間にある矛盾をすべて洗い出し、各々を「採用 / supersede / 保留」のいずれかで裁定し、実装 sub-issue を安全に切れる依存グラフへ落とす。

## 2. Minimum Viable Approach

骨格は 4 手。ここに含まれないものは §11 で却下する。

1. **入力を固定する** — v1.0 原本と epic #2394 本文の記述が一致しない箇所を洗い出し、v1.0 を一次資料として扱う（issue #2395 dispatch コメント 2026-08-26 の指示どおり）
2. **不変条件候補を実コードと突き合わせる** — Codex A が列挙した候補（issue #2395 本文「追加裁定」）を、現行 schema / RLS / command RPC と 1 件ずつ照合し、真偽を確定する
3. **19 項目を依存順に裁定する** — 各項目に `current contract / target contract / decision / effective milestone / data migration / compatibility / rollback / downstream blockers` を記載する（issue #2395 受け入れ条件）
4. **supersede map と出荷ゲートを固定する** — どの docs がどう置き換わるか、どの Step が何を前提にするかを明示し、#2396〜#2399 が起票できる状態にする

runtime code / migration / UI の実装はしない（issue #2395 非Scope）。

## 3. 正本階層と発効時点（裁定 #9）

- **current**: `strategy.md`（不変・最上位）→ `principles.md`（設計が進むたび更新）→ `docs/product/specs/*`（実装済み外部挙動の正本）→ `docs/projects/*/overview.md`（大規模変更の実装計画）。`strategy.md` と衝突する設計は採用しない（`strategy.md` 冒頭の宣言どおり）
- **target**: v1.0 は `strategy.md` の思想（参照するが所有しない・ゴーストまで自動化・記録の確定は人間の儀式・データの正直さ・通知は計画に仕える・軽い/早い/少ない）と**衝突しない**（§4 不変条件で逐語突合済み）。よって v1.0 は `strategy.md` を supersede する文書ではなく、**`principles.md` の全面改訂版 + `docs/product/specs/*` の複数ファイルの supersede 元**として位置づける
- **decision**: 採用。v1.0 は `principles.md` を置き換える（`principles.md` 自身が「設計が進むたび更新される」文書と自己規定しているため、置換は契約違反ではない）。`docs/product/specs/plan-record.md` / `tags.md`（→ 既に `activities.md` 相当へ移行済み、下記 §8）/ `review.md` / `external-calendar.md` は本書の裁定にしたがって改訂 or 新設する
- **effective milestone**: 本書 freeze 時点で `principles.md` の「設計上の未決リスト」のうち v1.0 が答えを出した項目（2レーン視覚表現、ゴースト有効期限、ゴースト経由 API 書き込み、予定凍結の猶予）を解消済みとして扱ってよい。**実際の `principles.md` 改訂は #2397（第一便）着手時**に行う（本書は裁定であって docs 更新の実施ではない）
- **data migration**: 無し（docs のみ）
- **compatibility**: 無し
- **rollback**: `[minutes]`。docs の git revert のみ
- **downstream blockers**: 無し

## 4. 不変条件（Codex 候補 → 実コード突合）

issue #2395 本文が候補リストとして渡した不変条件を、現行 schema・RLS・command RPC と突き合わせた結果。**候補のまま採用したもの**と**現行と不一致で訂正が要るもの**を分ける。

| #   | 候補                                             | 実コードでの現状                                                                                                                                                                                                                                                     | 判定                                                                      |
| --- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | 所有者整合（userId は認証 context 由来）         | `docs/engineering/invariants.md` §MCP の DB 書き込み境界「`p_user_id` は必ず `ctx.userId` 由来」で既に不変条件カタログに存在。`activities` / `categories` は複合 FK（§4-4、`tag-model-replacement/overview.md`）で構造的に担保済み                                   | **採用（既存）**                                                          |
| 2   | mutation の冪等性・receipt との atomic commit    | `invariants.md` に既存記載（「mutation 本体と immutable receipt は同じ transaction で確定」）                                                                                                                                                                        | **採用（既存）**                                                          |
| 3   | `end > start`                                    | `plans` / `records` の CHECK 制約として現行 schema に存在（半開区間 `[)` の前提）                                                                                                                                                                                    | **採用（既存）**                                                          |
| 4   | 新規 past Plan 禁止・future Record 禁止          | `plan-record.md`「過去日付への新規 Plan 追加 ✗」「TimeblockState: upcoming は Plan のみ取りうる」で現行仕様として明文化済み                                                                                                                                          | **採用（既存）**                                                          |
| 5   | 削除行の overlap/集計除外と restore 時再検証     | `deleted_at IS NULL` が EXCLUDE 制約・RLS の両方の対象条件（`plan-record.md` §重なり制約）。restore 時の重複再検証は `restore_record` RPC の既存挙動として存在するが、**明文化した不変条件カタログには未記載**                                                       | **採用・invariants.md へ追記要**                                          |
| 6   | 計上保存（category+未分類 = 全時間）             | `tag-model-replacement/overview.md` §3 の検証可能な不変条件と同一（`Σ(各カテゴリーの時間) + 未分類バケットの時間 = 対象期間の全ブロック時間`）。実装済み・単体テストで凍結予定                                                                                       | **採用（既存設計と同一）**                                                |
| 7   | timezone 変更・DST gap/fold の固定               | `invariants.md` §時刻「保存は UTC、表示と日境界はユーザー timezone」はあるが、**DST gap/fold の具体的な扱い（存在しない時刻・二重に存在する時刻）はどこにも明文化されていない**                                                                                      | **候補のまま未検証。実装 Step で新規に固定する必要あり（下記 §裁定 11）** |
| 8   | Proposal の exactly-once accept・accept 時再検証 | 現行の `external_calendar_events` ghost には「同一時間帯×同一アクティビティは最新が上書き、帯あたり表示1枚」（external-calendar.md）はあるが、確定（convert）操作の exactly-once 保証は明文化されていない。MCP 側の冪等 digest 機構（`operation_id` ベース）とは別物 | **候補のまま。Proposal 汎化時（裁定 #5・#15）に新規不変条件として起こす** |

**候補のうち構造的に確認できなかったもの**: Codex は issue 文脈へ接続していないため、上記以外の候補（issue #2395 本文列挙の全文）は実装 Step（#2396 契約基盤）着手時に改めて実コードと突き合わせる。本書では「実コードに実在が確認できた候補」だけを採用済みとして固定し、残りは実装時の検証対象として持ち越す。

## 5. 裁定の依存順に沿った 19 項目

issue #2395 が拘束する順序（`入力/baseline 固定 → 正本階層 → Plan/Record 核 → 分類・field → 計上/migration → Proposal → MCP/GCal/AI 移行 → 表示 → supersede map・出荷 gate`）で並べる。

### #9 正本階層と発効時点 → §3 に記載済み

### #10 Ledger identity（stable ID・Plan↔Record 対応・1:N・予定外記録）— **最大の構造衝突**

- **current contract**: ADR-025（`2026-07-09-time-model-split.md`）が確定させた「1 Plan : N Record」。`records.plan_id` が個別 FK として存在し、UI は「関連する記録」「元の予定」を個別に表示し、差分バッジは関連 Record 合計 − Plan 時間で計算する（`plan-record.md` §詳細 Inspector の関係表示・§Calendar の差分表示）。予定外 Record（`plan_id IS NULL`）は現行仕様として既に存在する
- **target contract**: v1.0 §3.3「予定は消費されない（変換モデルではなく併記モデル）。**個別リンク**・消化フラグ・スキップ操作・締めロックはすべて不要になり廃止」。突き合わせは「同一時間帯×同一アクティビティの重なりから表示時に導出」「予実レポートは**期間×アクティビティの合計同士**の突き合わせ」——つまり `plan_id` という**個別の永続対応そのものを持たない**モデル
- **decision**: **採用（GO、2026-08-26 User 裁可）**。ADR-025（1 Plan : N Record、個別 FK モデル）を**意図的な supersede**として記録する。突き合わせは `plan_id` という個別の永続対応を持たず、「期間×アクティビティの合計同士」の集計導出へ一本化する。**critical path 解除** — #2396〜#2399 の設計はこの「廃止」を前提に進めてよい（実装そのものは後続 epic の各ゲートで別途検証する）
- **effective milestone**: #2396（契約基盤）で `plan_id` FK 撤廃後のスキーマを設計する
- **data migration**: 既存の `records.plan_id` FK・関連 Record 表示 UI（「関連する記録」「元の予定」）・差分バッジ計算ロジック（`plan-record.md` §Calendar の差分表示）を集計ベースへ全面書き換える。`[days]` 級（#2396 着手時に既存データの `plan_id` 値をどう扱うか — 列を残して参照専用にするか drop するか — を実装判断として確定する）
- **compatibility**: MCP `records.create` / `records.update` が `planId` 相当を受け付けている場合は破壊的変更。#2399（第三便、MCP 公開契約見直しと同じ Step）で対応する
- **rollback**: `[days]`（データ構造の意味が変わるため、出荷後の巻き戻しは高コスト。§9 Reversibility Table 参照）
- **downstream blockers**: 無し（解除済み）。#10 は Plan/Record 核そのものであり、#11（lifecycle）・#12（canonical fields）・#13（deletion/provenance）・#14（accounting/migration）はこの決定を前提に確定してよい

### #11 lifecycle（future/past/active・暗黙 type 変換禁止・freeze 猶予・日跨ぎ）

- **current contract**: `TimeblockState`（`upcoming` / `active` / `past`）は既に導出型で DB カラムではない（`docs/product/glossary.md` #TimeblockState）。暗黙変換禁止は現行仕様どおり（`plan-record.md` §新規作成時の保存先ルール「日時編集による暗黙変換はしない」）。freeze 猶予は principles.md 末尾「設計上の未決リスト」に未決として残っている（「予定凍結の『開始直後の猶予』」）
- **target contract**: v1.0 §3.2「時制は導出のみ。時間を動かせば時制が変わる」「確定先の時制も同じ：提案を確定すると、過去なら記録・未来なら予定として着地する」——現行と**完全に一致**。freeze 猶予は v1.0 本文に直接の記載なし（未決のまま）
- **decision**: **採用（現行を追認）**。lifecycle の暗黙変換禁止・時制導出は現行実装と v1.0 が一致するため、新規の変更は不要。freeze 猶予は v1.0 でも未決のため、`principles.md` の未決リストにそのまま残す（本書の裁定対象外）
- **effective milestone**: 即時（docs 記述の整合のみ）
- **data migration**: 無し
- **compatibility**: 無し
- **rollback**: `[minutes]`
- **downstream blockers**: 無し

### #12 canonical fields（activity/title/note/link/fulfillment の必須性と外部 mapping）

- **current contract**: `title` は DB 互換で残るが表示に使わない（タグ名 source of truth、`plan-record.md` §Calendar カードの表示名）。メモは自由入力、リンクは「メモ内の URL」（`copywriting` 相当の慣行）。fulfillment 相当のフィールドは 2026-07-15 に完全削除済み（下記 #16 で詳述）
- **target contract**: v1.0 §6.1「フィールドは固定順：時制バッジ→アクティビティ→時間→メモ（唯一の自由テキスト。1行目はブロック表面にサブタイトル表示。URL もここで足りる）→（予定のみ）通知」。`title` という概念は無く、メモの1行目がサブタイトル。§3.5 で「充実」を Record 専用の新規フィールドとして導入
- **decision**: **採用**。現行の「タグ名 = 表示名、`title` はフォールバックしない」は v1.0 の「アクティビティ名が実質のタイトル」と整合。メモ1行目のサブタイトル表示は現行未実装のため新規 UI 要件として #2397 へ引き継ぐ。充実（`records.fulfillment`）は既存実装のまま Record の任意フィールドとして確定（#3 参照）
- **effective milestone**: #2397（第一便）
- **data migration**: 無し（`title` 列は既存のまま、表示だけ変わる）
- **compatibility**: MCP の `entries.list` 等が返す `title` フィールドは維持（読み取り専用の後方互換、書かない）
- **rollback**: `[minutes]`
- **downstream blockers**: 無し

### #13 deletion / provenance（soft-delete・restore・source 不変・関係先削除後の意味）

- **current contract**: soft delete は `deleted_at`（ADR-020）。`source` は作成時に確定する不変の provenance（`manual` / `external_calendar` / `api` など、`plan-record.md` / glossary）。関係先（Plan）削除後の Record 表示は「中立的な取得不可状態」（§詳細 Inspector の関係表示）
- **target contract**: v1.0 に soft-delete の明示的な記述は無いが、§1「事実は消さない」「台帳の信頼性の定義はただ一つ——そこにあるものはすべて、自分の指を一度通過した」という原則から、破壊的な物理削除を志向しないことは明確。§3.7「消したものの記録」は機能の廃止一覧であり、データの物理削除方針ではない
- **decision**: **採用（soft-delete・source 不変は維持、「関係先削除後の意味」は #10 の supersede に合わせて再設計）**。#10 が個別 FK を廃止したため、現行の「関係先（Plan）削除後、Record は『中立的な取得不可状態』を表示する」という UI 契約はそもそも成立しない（`plan_id` という参照自体が存在しなくなるため）。集計ベースのモデルでは Record は Plan のライフサイクルと独立して存在し続け、削除の影響は受けない。soft-delete（`deleted_at`）・source 不変は現行のまま維持する
- **effective milestone**: #2396（契約基盤）。#10 と同じ Step でスキーマへ反映する
- **data migration**: `plan_id` 撤廃と同一 migration で対応（#10 参照）
- **compatibility**: #10 に従う
- **rollback**: #10 に従う
- **downstream blockers**: 無し

### #14 accounting / migration（旧行 mapping・skip 保存・日別計上・情報保存・rollback）

- **current contract**: `skipped_at`（やらなかった）と未記録は別状態として Review で区別される（`plan-record.md` §skip と未記録の区別）。日別計上は Plan/Record それぞれ自身の日へ計上（別日の場合、`review.md`）
- **target contract**: v1.0 §3.7「期限切れ予定の三択・スキップ操作 → 併記モデルで概念ごと消滅。未実施は構造から導出」——**`skipped_at` を廃止**し、未実施を「同時間帯・同アクティビティの重なりが無い」という導出条件だけで表現する
- **decision**: **採用（supersede、確定）**。`skipped_at` の廃止は #10（併記モデルへの統一、2026-08-26 GO）の直接の帰結として確定した。未実施は「同時間帯・同アクティビティの重なりが無い」という導出条件だけで表現する
- **effective milestone**: #2396（契約基盤）。#10 と同一 Step
- **data migration**: `skipped_at` を持つ既存行の扱い（列を残してレポートから無視するか、drop するか）を #2396 着手時に実装判断として確定する。`[hours]`〜`[days]`（データ削除を伴うなら `[days]`）。**#1（8→8色パレット再割当）の既存カテゴリー色再割当も同じ Step で扱う**（User 裁可 2026-08-26「既存カテゴリーの色再割当は移行裁定（accounting/migration 項）に含める」）
- **compatibility**: MCP `plans.update` の `skipped` フィールド相当（要確認）に破壊的変更の可能性
- **rollback**: `[days]`（#10 に準ずる。データ削除を伴うため）
- **downstream blockers**: 無し

### #15 Proposal state / authority（storage・状態機械・payload version・accept/reject 権限）

- **current contract**: `external_calendar_events` が唯一の ghost 実装。状態は「取得成功時のみ表示・dismiss（可逆）・変換で独立行になる」という単純な二値に近い（明示的な状態機械カラムは無い、`external-calendar.md`）
- **target contract**: v1.0 §2.1「提案＝ゴースト（鉛筆）。半透明。台帳に乗らない。外部・AIのみが書ける」。§9「提案の口。API・MCPの書き込みエンドポイントは『提案の作成』に限定」。§6.1「提案の詳細＝確定シート：どのアクティビティ？の語彙グリッド＋確定＋破棄」。つまり Proposal は **GCal ghost・AI 下書き・将来のルーティンをすべて包含する単一の汎用状態機械**であるべき
- **decision**: **採用の方向（GCal ghost に限定）、実装設計は #2399（第三便）へ持ち越し**。原則（外部は提案しか書けない、確定は人間、汎用状態機械）は strategy.md §4-3/§4-4 の既存原則と完全に整合するため、GCal ghost を汎用 Proposal 状態機械へ育てる方向は採用する。**ただし #4 の確定（MCP は直接書き込みのまま出荷）により、この Proposal 汎化は「MCP を含む外部入力全体の統一契約」ではなく「GCal ghost（および将来の AI 下書き・ルーティン）専用の状態機械」に scope が縮小する。** v1 では MCP 直接書き込みと GCal Proposal が並存する（#4 参照）。storage 設計（`external_calendar_events` を汎用 `proposals` テーブルへ改名・拡張するか、別テーブルを新設し ghost を移行するか）は #2399 着手時の実装判断とし、本書では確定しない
- **effective milestone**: #2399（第三便）
- **data migration**: `external_calendar_events` の既存行を汎用 Proposal へ移行する場合、schema 変更を伴う。`[hours]`
- **compatibility**: 現行 `listEvents` procedure・dismiss 挙動は Proposal 汎化後も同等機能を維持する必要がある
- **rollback**: `[hours]`
- **downstream blockers**: 無し（#4 は確定済み。#16 は fulfillment 除去分のみ本節と独立に進行）

### #4 外部書き込み（#1754 の MCP direct write と「外部は提案しか書けない」の移行）— **2番目に大きい衝突**

- **current contract**: #1754（MCP Step 6）は Plan/Record への**直接の** create/update/delete/restore を提供する設計で、Candidate 1〜7 まで production 実装済み（`docs/engineering/invariants.md` §MCP の DB 書き込み境界に不変条件多数）。ただし **global write gate は production で既定 OFF、`enabled_client_ids` は空**（同 invariants.md）。実接続数は `oauth_connections` / `oauth_tokens` / `oauth_authorization_codes` 全件 0 行（2026-08-18 実測、`tag-model-replacement/overview.md` §7-4、および個人メモリ [mcp-oauth-has-zero-production-connections.md]）
- **target contract**: v1.0 §9「提案の口。API・MCPの書き込みエンドポイントは『提案の作成』に限定。…確定は人間のクリックだけ」「全自動化はしない」。MCP からの直接 Plan/Record 書き込みという概念自体が存在しない
- **decision**: **MCP は直接書き込みのまま出荷（v1.0 §9 とは分岐、2026-08-26 User 裁可）**。指揮台の推奨（実接続 0 件の低コストな窓を使い提案作成のみへ寄せる）は User 判断で不採用となった。**#1754 は現行 scope のまま完了させる**——Plan/Record への直接 create/update/delete は v1 でも維持する。v1.0 §9「外部は提案しか書けない」は**v1 の不変条件にはせず、将来 phase の目標状態**として記録する（本節・`principles.md` 双方にこの位置づけを明記する）。指揮台推奨との分岐は判断ジャーナルへ記録済み（[#1754](https://github.com/Dayopt/dayopt/issues/1754) 参照、`judgment:diverged`）
- **直接書き込み経路と将来の提案専用モデルの共存・移行条件**（User 裁可により本節へ明記が必須）: v1 では MCP の `plans.*` / `records.*` 直接書き込みツールと、GCal ghost（#15 で Proposal へ汎化）が並存する——「同じ『提案』概念に一本化されていない 2 つの外部入力経路」が v1 の暫定形になる。将来 phase で MCP を提案専用へ移行する場合の条件: (a) 実接続が発生した後に転換すると後方互換コストが生じるため、転換するなら実接続が付く前が望ましい（本判断時点でこの窓は意図的に見送られた） (b) 転換時は `MCP_TOOL_SCHEMA_VERSION` の破壊的 bump を伴う（#16 参照）
- **effective milestone**: 該当なし（v1 では変更しない）。将来 phase 着手時に本節を再訪する
- **data migration**: 無し（現状維持）
- **compatibility**: 無し（現状維持のため後方互換の懸念なし）
- **rollback**: 該当なし（変更しないため）
- **downstream blockers**: 無し

### #16 public contract 移行（tool/scope/schema・resource ID・receipt replay・deprecation）

- **current contract**: MCP tool 20 本（`entries.list` / `activities.list` / `categories.list` / `segments.list` / `constraints.get` / `review.get` / `plans.*` 7本 / `records.*` 7本）が実装済み。`MCP_TOOL_SCHEMA_VERSION = 3`（#2162 Step 6 で 2→3 へ既に 1 度 bump 済み、`tag-model-replacement/overview.md` §7-4）。`records.create` / `records.update` は `fulfillment` 引数を受け付ける
- **target contract**: **#4 の確定（MCP は直接書き込みのまま出荷、v1.0 §9 不採用）により、`plans.*` / `records.*` 6 tool の「Proposal 作成」への全面再定義は v1 では行わない。** v1 で必要な変更は #3（充実）の裁定のみ: `records.create` / `records.update` から `fulfillment` 引数を除去する
- **decision**: **採用（縮小 scope で確定）**。全面再定義は将来 phase（#4 参照）まで見送り、v1 では `fulfillment` 引数の除去のみを行う
- **effective milestone**: #2399（第三便、MCP 公開契約変更と同じ Step）
- **data migration**: 無し（実接続 0 件）
- **compatibility**: 実接続 0 件のため後方互換コストなし。`fulfillment` 除去は破壊的変更だが影響を受ける外部クライアントは存在しない
- **rollback**: `[hours]`
- **downstream blockers**: 無し

### #17 source matrix（GCal・MCP/API・AI・ルーティン）

- **current contract**: `source` 列は `manual` / `external_calendar` / `api`（Plan）、`manual` / `from_plan` / `auto_migrated` / `external_calendar` / `api`（Record）。「ルーティン」（繰り返し）は実コードに一切存在しない（`rg routine` 全件ヒットなし、確認済み）。`principles.md` は「ルーティン(繰り返し設定したブロック)は当日にゴーストとして現れ」を**未実装**の目標状態として記載しているのみ
- **target contract**: v1.0 §9「シリーズ信任。繰り返し予定に限り『以後このシリーズは自動で箱にする』を人間が一度宣言できる」。§12（将来レイヤー）「提案の定期便：繰り返しの正しい姿」。つまり v1.0 でも**繰り返し（ルーティン）は v1 に本格実装せず**、GCal のシリーズ信任という限定形のみ v1、汎用の「提案の定期便」は将来レイヤー
- **decision**: **採用**。Codex A が指摘した「ルーティンが裁定から落ちている」という懸念は、v1.0 原本を読むと実際には「v1 では GCal シリーズ限定、汎用ルーティンは将来レイヤー」という位置づけで**裁定は不要**（v1.0 内で既に明確）。source enum に `routine` 相当の値を **v1 では追加しない**
- **effective milestone**: GCal シリーズ信任は #2399（第三便）。汎用ルーティンは将来レイヤー（本書のスコープ外）
- **data migration**: 無し
- **compatibility**: 無し
- **rollback**: `[minutes]`
- **downstream blockers**: 無し

### #18 governance（entitlement・disconnect/revoke・retention・export・account deletion）

- **current contract**: 外部カレンダー連携は Pro 限定（entitlement 検査済み、`invariants.md`）。disconnect/revoke・retention cleanup RPC・GDPR export は実装済み（`external-calendar.md`、`invariants.md` §OAuth・暗号）
- **target contract**: v1.0 §9「データ所有の宣言。全量エクスポートと読み取り API を最初から掲げる」——現行の GDPR export 方針と一致。entitlement・retention の具体的な数値・手順に v1.0 は言及していない（現行実装を前提として問題ない）
- **decision**: **採用（現行を維持）**。v1.0 に governance の詳細規定はなく、現行の entitlement/retention/export 実装をそのまま踏襲する
- **effective milestone**: 変更なし（既存実装のまま）
- **data migration**: 無し
- **compatibility**: 無し
- **rollback**: 該当なし
- **downstream blockers**: 無し

### #19 presentation ownership（`/report` 対 panel・期間・mobile mode・全 drag surface）

- **current contract**: `/report` はフルページ、3 セクション固定（差分・Time P/L・セグメント）、`range=day|week` のみ（`review.md`）。Calendar は Day/Week/Multi-Day、モバイルは Day/Week 切替（`calendar.md`）
- **target contract**: v1.0 §7「四つの章」（配分・執行・質・整える）。現行 3 セクションから **4 セクションへ拡張**（「質」＝羅針盤が新規、充実データに依存）。§8 モバイルは「タブバーは無い、ドック常駐」という現行と異なる IA
- **decision**: **採用**。4 章構成への拡張は #16（充実の再導入、#12 に従属）が確定して初めて意味を持つ（羅針盤は充実データが無いと描けない）。モバイル IA（ドック常駐・タブバー廃止）は現行の Day/Week 切替 UI からの UI 全面刷新であり、#2397/#2398（第一便・第二便）のモバイル実装 Step で扱う
- **effective milestone**: 「質」章は #2398（第二便）、モバイル IA 刷新は #2397（第一便）
- **data migration**: 無し
- **compatibility**: `/report?panel=` 系の旧リダイレクト（review.md 記載）は維持
- **rollback**: `[minutes]`（UI のみ）
- **downstream blockers**: #16（充実データ）

### #1 用語と分類（8色 vs 現行10色・カテゴリー行チェックの有無・セグメント作成場所）— **直近の User 決定を覆しうる**

- **current contract**: `#2162` で 2026-08-18 に User が確定・実装済み: **カテゴリー10色パレット**（`CATEGORY_COLOR_NAMES` 実測10色）、**カテゴリー見出しにチェックボックスなし**（`tag-model-replacement/overview.md` §5-1「カテゴリー見出しにチェックボックスを置かない（epic確定）」）、セグメント作成は Sidebar のコンテキストメニュー（Review feature、`review.md`）
- **target contract**: v1.0 §4.3「8はライト／ダーク両モード…全条件で判別が保証できる実務上限」（8色固定）。§5.1「カテゴリー行のチェック＝フィルタ兼分母の出し入れ」（チェックボックスあり）。§5.4 テンプレート作成は「生きた日から」、セグメントは v1.0 に作成場所の明記なし（レポート面が「実需から」と読める記述はテンプレートのみ、§2.1 表）
- **decision**: **採用（GO、2026-08-26 User 裁可）**。v1.0 の8色固定・カテゴリー行チェックボックスありへ揃える。2026-08-18 の#2162確定（10色 nullable・チェックボックスなし）を**意図的な再考として supersede**する（§8 supersede map に記録）
- **effective milestone**: #2396（契約基盤）着手時に色再割当てロジックを設計する
- **data migration**: 既存 10 色のうち縮小対象となる色（実装確認要、現行 gray は「未分類専有色」で v1.0 も同じ扱いのため実質 9→8 相当）を使うカテゴリーの再割当てが必要。**#14（accounting/migration）と同一 Step で扱う**（User 裁可どおり）。`[hours]`
- **compatibility**: 色 token（`--category-*`）の削除は Storybook `Colors.stories.tsx` 等に影響
- **rollback**: `[hours]`
- **downstream blockers**: 無し（他項目には波及しない、閉じた論点）

### #2 Plan / Record（現行の併記・個別リンク・skip の廃止方針）→ #10・#14 に統合済み

本項目は #10（Ledger identity）・#14（accounting/migration）と同一の論点。重複して裁定しない。

### #3 充実（既存 3 択実装と v1.0 契約の差分）

**訂正（2026-08-26、指揮台指摘）**: 本項目は当初「FulfillmentScore の再導入可否」として裁定していたが前提が stale だった。Chronotype/FulfillmentScore は 2026-07-15 に完全削除されたが（`docs/product/log/2026-07-15-chronotype-fulfillment-removal.md`）、[PR #2330](https://github.com/Dayopt/dayopt/pull/2330)（2026-08-23 merge）が**旧実装とは別の新規実装として `records.fulfillment` 3択を既に復活・出荷済み**。裁定すべきは「再導入するか」ではなく、**既存実装と v1.0 契約の差分**。

- **current contract**: `records.fulfillment`（`low` / `medium` / `high`、nullable、Record にのみ付与）。書き込み経路は UI（`TimeblockInspectorForm`）・tRPC（`recordCommands`）に加え、**MCP `records.create` / `records.update` も `fulfillment` 引数を受け付けて直接書き込む**（`apps/product/src/app/api/mcp/_tools/timeblock-mutations.ts:83,97,253,284`）。入口はコミットトーストではなく詳細 Inspector のトグル。羅針盤（質の章）は未実装
- **target contract**: v1.0 §3.5「APIとMCPにはこの列への書き込み権限を与えない」（唯一の閉域列）。§6.3「入口はコミットトースト」。値は3択で現行と cardinality 一致（表現順序のみ「充実／ふつう／消耗」対「high/medium/low」で対応）
- **decision**: **採用（既存実装を v1.0 契約へ合わせて是正する）**。値の3択構造・Record 専有は既に v1.0 と一致しているため変更不要。**MCP からの書き込みは v1.0 の明示的な不変条件（AI/外部への閉域）に違反しており是正が必要** — `timeblock-mutations.ts` の `fulfillment` 引数を `records.create` / `records.update` の入力スキーマから除去する。コミットトーストへの入口移設は UI 実装 Step（#2397）で行う
- **effective milestone**: MCP 書き込み経路の除去は破壊的変更のため #2399（第三便、MCP 公開契約の見直しと同じ Step）で行う。コミットトースト入口は #2397（第一便）
- **data migration**: 無し（既存列・既存値はそのまま維持。書き込み経路の制限のみ）
- **compatibility**: **実接続 0 件**（§裁定4 の根拠と同一実測）のため、MCP スキーマから `fulfillment` を除去しても影響を受ける外部クライアントは存在しない。`MCP_TOOL_SCHEMA_VERSION` の bump 要否は #16（public contract 移行）と同じ Step でまとめて判断する
- **rollback**: `[hours]`
- **downstream blockers**: #4（外部書き込み境界、同じ Step でまとめて対応）、#12（canonical fields）、#19（質の章）

### #5 提案（ghost の汎用化）→ #15 で裁定済み

重複しないよう #15 に統合。

### #6 予実表示（#2236 の解決）

- **current contract**: [#2236](https://github.com/Dayopt/dayopt/issues/2236) は「検討 issue（未確定）」として open のまま。現行は「幅を分割して予定=左／記録=右」の固定 2 レーン、User 自身が「見にくい」と感じている
- **target contract**: v1.0 §4.1「状態は塗り・破線・半透明の3つだけ」§4.2「予実の帯」「帯割れの幅は予定30／記録70の非対称」。#2236 が模索していた「予定のない記録は記録だけを全幅表示」「表示フィルタの是非」に対し、v1.0 は明確な答え（30:70 の非対称 split、フィルタなしで構造が語る）を既に出している
- **decision**: **採用**。v1.0 は #2236 の懸案に対する User 自身の後続の結論と解釈でき、内容も #2236 が挙げた 2 方向性（シームレスな併記・フィルタの是非）のうち「併記だが非対称、フィルタは作らない」を選んだ形で整合する。#2236 は本書の裁定をもって解決済みとしてクローズしてよい
- **effective milestone**: #2397（第一便）
- **data migration**: 無し
- **compatibility**: 無し
- **rollback**: `[minutes]`
- **downstream blockers**: 無し
- **後続処理**: #2236 に本書へのリンクを添えてクローズすることを推奨（送付事項ではなく指揮台の裁量作業として §7 に記載）

### #7 AI境界（サービス内 AI 機能を入れない現行判断と v1.0 の将来レイヤー）

- **current contract**: `strategy.md` §4-8「AI は外にいる。in-app の AI 機能は作らない」。ルールベースの週次補正のみ実装済み
- **target contract**: v1.0 は「AI の箱下書き」「クロノタイプの導出レイヤー」を明確に §12（将来レイヤー、v1に入れない）へ隔離しており、v1 スコープの記述（§1〜§11）には in-app AI 機能が一切登場しない
- **decision**: **採用（矛盾なし）**。現行方針と v1.0 は完全に整合。v1 は外部・AI共通の提案契約（#15）までとし、AI 自体の実装（下書き生成・クロノタイプ導出）は将来レイヤーのまま凍結する
- **effective milestone**: 該当なし（v1 スコープ外）
- **data migration**: 無し
- **compatibility**: 無し
- **rollback**: 該当なし
- **downstream blockers**: 無し

### #8 既存 spec の置換範囲 → §8（supersede map）に記載

### 11 DST gap/fold（Codex 候補由来、依存順「baseline」に位置づけ直す）

- **current contract**: `invariants.md` §時刻「保存は UTC、表示と日境界の判定はユーザーの timezone で行う」のみ。DST の gap（存在しない時刻、例: 夏時間開始の 2:00-3:00）・fold（重複する時刻、例: 終了の 1:00-2:00 が 2 回存在）の具体的な扱いは、現行仕様のどこにも明文化されていない
- **target contract**: v1.0 に DST の直接の記述はない。§3.6 睡眠が「0時をまたいで連続、集計は0時で分割」と日境界の扱いには触れるが、DST 自体には触れていない
- **decision**: **保留（実装 Step の新規論点、v1.0 では解決されない）**。DST gap/fold は v1.0 のスコープ外の技術的不変条件であり、#2396（契約基盤）着手時に別途固定する。本書では「未解決である」ことを明記するに留める
- **effective milestone**: #2396（契約基盤）
- **data migration**: 無し（新規の検証・テスト追加のみ）
- **compatibility**: 無し
- **rollback**: `[minutes]`
- **downstream blockers**: 無し（他項目をブロックしない、並行して解決可能）

## 6. 依存グラフ（sub-issue 切り出し単位）

issue #2395 が拘束する依存順を図示する。**2026-08-26、User 裁可により全 19 項目が確定した（critical path 解除済み）。**

```
baseline 固定（#9 正本階層、DST 未解決を明記）
  ↓
Plan/Record 核（#10 Ledger identity ← 採用/GO、#11 lifecycle ← 採用）
  ↓
分類・field（#12 canonical fields ← 採用、#1 用語 ← 採用/GO、#3 充実 ← 採用・確定済み）
  ↓
計上/migration（#14 accounting ← 採用、#13 deletion ← 採用）
  ↓
Proposal（#15 Proposal state ← 採用・GCal限定、#5 は#15に統合、#17 source matrix ← 採用）
  ↓
MCP/GCal/AI 移行（#4 外部書き込み ← 現状維持・確定、#16 public contract ← 縮小scopeで採用、#7 AI境界 ← 採用/矛盾なし）
  ↓
表示（#6 予実表示 ← 採用、#19 presentation ← 採用）
  ↓
governance（#18 ← 採用/現状維持）
  ↓
supersede map・出荷 gate（#8、§8）
```

**全項目確定済み。#2396〜#2399 の `status:blocked` は本書 freeze をもって解除できる。**

## 7. 価値判断が要った論点と確定経緯（判断ジャーナル）

指揮台/User の判断を仰いだ 4 件の経緯と最終決定。全件 2026-08-26 に確定した。

1. **#10 Ledger identity（最重要・critical path）**: `plan_id` 個別リンクを廃止し ADR-025 を supersede するか。**指揮台推奨**（v1.0 どおり廃止）と**User 裁可**（GO）が一致。ADR-025 を意図的 supersede として記録
2. **#1 用語と分類（8色 vs 10色、カテゴリーチェック有無）**: v1.0 の8色・チェックボックスありへ揃えるか。**指揮台推奨**（採用）と**User 裁可**（GO）が一致。#2162 の 2026-08-18 確定を意図的な再考として supersede
3. **#4 外部書き込み境界（#1754 のスコープ変更）**: MCP を提案作成のみへ転換するか。**指揮台推奨**（実接続0件の窓を使い転換）と**User 裁可**（現行 scope のまま完了、転換は将来 phase の目標）が**分岐**。この分岐は判断ジャーナルへ記録済み（[#1754](https://github.com/Dayopt/dayopt/issues/1754)、`judgment:diverged`）。何をもって正否を判定するかの観点: 将来 MCP 実接続が発生した後に「提案のみ」へ後退させるコストと、v1 で先に転換しておくコストの差が、月次 gardening で実測に基づき判定される
4. **#3 充実**: 前提が stale だった（PR #2330 で 2026-08-23 に既に出荷済み）。裁定は「再導入するか」ではなく「既存実装と v1.0 契約の差分」に書き換えた（§5 #3 参照）。価値判断ではなく事実確認だったため User 確認は不要だった

## 8. supersede map（既存 docs との対応）

| 既存 doc                                          | 扱い                                                                                                                                                                                                                                                                     | 発効時点       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| `docs/product/principles.md`                      | 全面改訂（v1.0 の内容へ置換、「設計上の未決リスト」の一部は本書の裁定で解消済みとして反映）。§9「つながる」に v1.0 §9 の「提案のみ」原則を**将来 phase の目標状態**として明記し、v1 では MCP 直接書き込みと共存する旨を記載する（#4 参照）                               | #2397 着手時   |
| `docs/product/specs/plan-record.md`               | `plan_id` 個別リンク廃止（#10）を反映して改訂 or 新設（`ledger.md` 相当への改名を含めて#2396 着手時に判断）                                                                                                                                                              | #2396 着手時   |
| `docs/product/specs/tags.md`                      | **既に廃止済み**（#2162 Step 4-8 で activities/categories へ完全移行、feature ディレクトリも撤去済み）。ただし正式な `activities.md` spec 新設は #2162 側の残 Step（Step 0「用語と docs の確定」の一部）としてまだ行われていない。本書では新設不要（#2162 側の完了条件） | #2162 側       |
| `docs/product/specs/review.md`                    | #19（presentation ownership）確定内容を反映し、4章構成・充実データ依存部分を改訂                                                                                                                                                                                         | #2398 着手時   |
| `docs/product/specs/external-calendar.md`         | #15（Proposal 汎化、GCal 限定）確定内容を反映し、汎用 Proposal との関係を改訂                                                                                                                                                                                            | #2399 着手時   |
| `docs/product/glossary.md`                        | 「提案」「充実」「余白」「テンプレート」の用語追加、既存「未記録/やらなかった/予定外」節を #10・#14 の supersede に合わせて整理                                                                                                                                          | #2396 着手時   |
| `docs/engineering/invariants.md`                  | §4 で確認した「削除行の restore 時再検証」を追記。#10・#15 に伴う Proposal・Ledger identity 関連の新規不変条件を追記                                                                                                                                                     | 各 Step 着手時 |
| `tag-model-replacement/overview.md`（§5-1・§4-1） | **本書の #1（8色固定・カテゴリー行チェックボックスあり）が 2026-08-18 の確定（10色 nullable・チェックボックスなし）を supersede** する旨の相互参照を追記する。当該ファイルの内容自体は書き換えず、参照を追加するに留める（#2162 側の完了済み設計書のため）               | #2396 着手時   |

## 9. Reversibility Table

| 項目                                                  | Reversibility | 備考                                                                                                                                                      |
| ----------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 本書（docs のみ）                                     | `[minutes]`   | git revert のみ                                                                                                                                           |
| #9 正本階層の確定                                     | `[minutes]`   | docs 記述のみ                                                                                                                                             |
| #11 lifecycle（現行追認）                             | `[minutes]`   | 変更なし                                                                                                                                                  |
| #17 source matrix（現行追認）                         | `[minutes]`   | 変更なし                                                                                                                                                  |
| #7 AI境界（矛盾なし）                                 | 該当なし      | 変更なし                                                                                                                                                  |
| #18 governance（現行維持）                            | 該当なし      | 変更なし                                                                                                                                                  |
| #6 予実表示の視覚文法変更                             | `[minutes]`   | UI のみ、データ非依存                                                                                                                                     |
| #1 用語と分類（8色固定への再割当て）                  | `[hours]`     | 既存カテゴリーの色再割当てを伴う。#14 と同一 Step                                                                                                         |
| #3 充実（MCP書き込み経路の除去）                      | `[hours]`     | 列は既存のまま、除去した MCP スキーマ引数を戻せば復元可能                                                                                                 |
| #12 canonical fields                                  | `[minutes]`   | UI 表示のみ、#10 に整合済み                                                                                                                               |
| #13 deletion/provenance（関係先削除後の意味の再設計） | `[hours]`     | #10 と同一 migration                                                                                                                                      |
| #15 Proposal 汎化（GCal 限定、schema 変更）           | `[hours]`     | `external_calendar_events` 拡張または新テーブル                                                                                                           |
| #4 外部書き込み（現状維持）                           | 該当なし      | v1 では変更しない                                                                                                                                         |
| #16 public contract（`fulfillment` 除去のみ）         | `[hours]`     | 全面 schemaVersion bump は将来 phase まで見送り                                                                                                           |
| **#10 Ledger identity（`plan_id` 個別リンク廃止）**   | `[days]`      | **最も不可逆性が高い**。出荷済み UI・データ意味の全面転換。User 裁可により実行確定（`plan-format.md` の `[irreversible]` 級の正当化要件を満たす形で採用） |
| #14 accounting（`skipped_at` 廃止 + 色再割当て）      | `[days]`      | #10 に従属、データ削除を伴うため不可逆                                                                                                                    |

## 10. Existing Code to Reuse

- **`tag-model-replacement/overview.md` の設計パターン全般** — 複合 FK による所有者整合（トリガー0本）、additive-only な RPC 変更手順、`enforce_*_tag_owner` 系トリガーの置き換え手法は、#10 が「新テーブル追加」を伴う場合にそのまま踏襲できる
- **`useCalendarFilterStore` の persist migrate パターン** — Proposal 汎化・充実列追加時のフィルタ state 拡張で同型の migrate が要る
- **`buildTagPL` / `aggregatePlanRecordEstimationAccuracy` の残余バケット畳み込み** — #10 が集計ベースへ移行する場合、期間×アクティビティ集計のロジックの土台になる
- **`WeeklyReflectionPanel` の n>=2 沈黙閾値パターン**（ADR-026） — 羅針盤（#19「質」の章）の n<5 沈黙もこの表現ポリシーを踏襲する
- **`external_calendar_events` の ghost dismiss（可逆な状態切り替え）** — Proposal 汎化時の「破棄」操作の実装土台

## 11. What I'm Not Doing

- **runtime code / migration / UI の実装をしない**（issue #2395 非Scope）
- **MCP を提案作成専用へ転換しない**（#4、User 裁可により v1 では現状維持。将来 phase の目標状態としてのみ記録する）
- **DST gap/fold の実装を設計しない** — v1.0 のスコープ外であり、#2396 着手時の別論点として持ち越す
- **#2175（tags destructive migration）の凍結解除条件をこの project の完了条件と混同しない** — #2175 は #2162 側の完了条件であり、本書の裁定対象外
- **`principles.md` / 各 spec の実際の書き換えをこの PR で行わない** — 本書は裁定であり、docs 更新の実施は各 milestone（#2396〜#2399）着手時
- **汎用 ルーティン（提案の定期便）を v1 で設計しない**（#17、将来レイヤーのまま凍結）
- **セグメント・テンプレートに期間/指標/グルーピングを保存させる設計をしない**（v1.0 §6.4/§7.2 の既存縛りをそのまま継承。強化しない代わりに緩めない）

## 12. 検証

- `pnpm docs:check` が green（frontmatter・リンク・命名規約）
- 本書の 19 項目すべてが `current contract / target contract / decision / effective milestone / data migration / compatibility / rollback / downstream blockers` の最低限のフィールドを記載していること（issue #2395 受け入れ条件）
- 全 19 項目が確定済み（2026-08-26、User 裁可）であり、#2396〜#2399 の `status:blocked` は本書 freeze をもって解除できること
- §7 の判断ジャーナル記載どおり、#4 の分岐が `judgment:diverged` として [#1754](https://github.com/Dayopt/dayopt/issues/1754) に記録されていること

## 13. 関連

- [epic #2394](https://github.com/Dayopt/dayopt/issues/2394) — v1 全体再構成の親 epic、固定するプロダクト契約
- [issue #2395](https://github.com/Dayopt/dayopt/issues/2395) — 本書を成果物とする正本化 issue、Codex A レビューコメント
- [#2162](https://github.com/Dayopt/dayopt/issues/2162) / [tag-model-replacement/overview.md](../tag-model-replacement/overview.md) — アクティビティ/カテゴリー/セグメント基盤（土台として再利用）
- [#2236](https://github.com/Dayopt/dayopt/issues/2236) — 予実重なり表示の検討（本書 #6 で解決）
- [#2292](https://github.com/Dayopt/dayopt/issues/2292)（closed） — 7日間自走ループ実測、principles.md 鮮度是正の先行実績
- [#2260](https://github.com/Dayopt/dayopt/issues/2260) — 見積もりキャリブレーション実測
- [#1754](https://github.com/Dayopt/dayopt/issues/1754) — MCP Step 6、外部書き込み境界の裁定対象
- [#2175](https://github.com/Dayopt/dayopt/issues/2175) — tags destructive migration（本書の裁定対象外、#2162 側の完了条件）
- [2026-07-15 Chronotype/FulfillmentScore 削除](../../product/log/2026-07-15-chronotype-fulfillment-removal.md) — #3（充実）が supersede する決定
- [ADR-025 時間モデル分割](../../product/log/2026-07-09-time-model-split.md) — #10 が supersede しうる決定
- [strategy.md](../../strategy.md) / [principles.md](../../product/principles.md) — 正本階層の上位文書
