---
status: active
last_verified: 2026-08-20
---

# external-calendar-fenced-writer-migration

束: [#2050](https://github.com/Dayopt/dayopt/issues/2050)（代表）+ [#2156](https://github.com/Dayopt/dayopt/issues/2156) + [#2078](https://github.com/Dayopt/dayopt/issues/2078)。進捗・残作業は #2050 を正本とする（本 doc に複製しない）。

## Goal

`sync-service.ts` と `connection-service.ts` の直接 upsert/update/delete による Calendar sync 書き込みを、`20260730090017_fenced_calendar_sync_writers.sql` が定義する 5 つの CAS フェンス付き RPC（`begin_calendar_sync_run_v1` / `persist_calendar_sync_result_command_v1` / `finish_calendar_sync_run_v1` / `clear_calendar_sync_cursor_command_v1` / `replace_selected_calendars_command_v1`）へ移行し、disconnect 中の sync 書き込み race（#2005 由来の受け入れ条件）を構造的に閉じる。同時に、この移行が露呈させる allowlist gap（#2078）と、無関係だが同束に指定された orphan grant revoke gap + spec 未反映（#2156）を解決する。

## なぜ #2050 が今まで手つかずだったか（調査結果）

migration ファイル冒頭に `-- Draft: replace every service-role Calendar sync, ... mutation with generation/authority/DB-sequence fenced commands.` とあるとおり、2026-07-30 の大型 migration（commit `47443afd1`、45 ファイル同時）で RPC 群だけが DB スキーマとして先行実装され、application 側の切り替えは意図的な設計判断ではなく**単純な未完了フォローアップ**として残った（`docs/engineering/log/` `docs/projects/` に該当する設計記録なし）。`sync-service.ts:66-74` と `connection-service.ts:646-650` のコード内コメントが唯一の追跡記録で、後者が「#2050 で追跡する」と明記している。

## Plan-review 統合（2026-08-20、plan-fact-checker + plan-critic 並列実施）

fact-checker: RPC discriminant / allowlist 5 値 / `resolveGoogleCalendarAuthorityIdentity` / route.ts scoping バグ / `loadConnectionSecret` 拡張可否 / docs 未反映は全て VERIFIED。**2 件の訂正**: (a) `DEFINITIVE_ROLLBACK_CODES` は `account-deletion.ts` ではなく `token-rotation.ts:20` にある（`account-deletion.ts` の `callRpc` は別の `isRetryableContention` allowlist を使う）。(b) `loadSelectedCalendars`（sync-service.ts:525-541）は `id` 列を select しておらず、3 RPC が要求する `p_calendar_selection_id` を渡せない — 追加の select 列拡張が必要。

critic: REVISE。技術的に妥当な指摘を全て採用し、下記 §0（新規）・§3・§4 に反映した。**「#2156 を別 PR に切り出す」提案は不採用**（理由は本 doc 末尾「dispatch 指示との整合」）。

### 0. 新規: terminal marker を `_v3` へ昇格（critic 指摘、採用）

`getConfiguredExternalLifecycleAppVersion()` が読む `get_external_lifecycle_app_version_v2` は、**Candidate 3（authority fence/generation）lifecycle chain 専用の marker**であり、5 fenced sync writer RPC の存在を保証する設計にはなっていない（marker 自身のコメントがそう明記している）。現在 v1（`lifecycleVersion===1`）が「5 RPC が使える」を偶然正しく含意しているのは、`20260730090017`（RPC 定義）のファイル名 timestamp が `20260730090054`/`090056`（v1/v2 marker）より前という**migration 適用順の偶然**にすぎない。production は v2 marker 適用済み（`docs/engineering/data/db/rls-snapshot.md:392-393` で確認）で、今回の意図（5 RPC が使えることを保証する明示的な gate）と現状の一致は事実だが、暗黙結合のまま新機能を乗せると将来の migration 挿入で静かに破綻しうる（`.claude/rules/workflow.md` §同型指摘の打ち切り「誤った境界は境界が無いより危険」）。

- `finish_calendar_sync_run_v1` の allowlist 追加 migration（旧 §1）の**後に**、新規 migration で `public.get_external_lifecycle_app_version_v3()`（`SELECT 2`、`service_role` のみ GRANT、v1/v2 と同じ terminal marker idiom）を追加する
- `apps/product/src/lib/database/external-lifecycle-version.ts` の `getExternalLifecycleAppVersion` を `0 | 1 | 2` に拡張する（`_v3` が無ければ `_v2` を試して 1、`_v2` も無ければ 0）
- `sync-service.ts` / `connection-service.ts` の分岐条件を `lifecycleVersion === 1` から `lifecycleVersion >= 2` に変える（以下 §3・§4 で「v1 分岐」と書いている箇所は全て `>= 2` 分岐を指す）

### 1. 前提 migration（#2078 を先に適用）

`finish_calendar_sync_run_v1` の `p_last_sync_error` allowlist（現在 5 値: `encryption_key_invalid` / `partial_failure` / `provider_unavailable` / `rate_limited` / `reauth_required`、637-643 行）に `partial_timeout` を追加する `CREATE OR REPLACE FUNCTION` migration を新規作成する。既存 PL/pgSQL 関数は凍結資産（`.claude/rules/architecture.md`）だが、これは `sync-service.ts` の `SyncErrorCode`（6 値）との既知のギャップを埋める bug-fix 相当であり機能追加ではない。他の関数定義（CAS ロジック本体）は一切変更しない。**適用順序**: このマイグレーション → §0 の `_v3` marker migration → 型生成 → app デプロイ、の順を守る（app が `_v3` を見て初めて `partial_timeout` を書きにいくため、逆順にはなり得ない設計だが、明示しておく）。

### 2. 新規モジュール `fenced-sync-writer.ts`

`apps/product/src/features/external-calendar/server/fenced-sync-writer.ts` を新設し、5 RPC を型付きラッパーとして公開する。retry ループの骨格は `account-deletion.ts` の `callRpc<T>`（167-190 行）を参考にするが、**確定失敗の分類は `token-rotation.ts:20` の `DEFINITIVE_ROLLBACK_CODES` パターンを踏襲する**（fact-checker 訂正を反映）。エラーコード分類表（critic 指摘、必須）:

| コード                                                                                                                  | 分類       | 扱い                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| `22023`（invalid input）                                                                                                | definitive | 即終了。retry しない。ここに到達するのは呼び出し側のバグ（例: chunk 化漏れ）なので Sentry capture する |
| `54000`（sequence exhausted）                                                                                           | definitive | 即終了。理論上 到達しない値域だが到達したら Sentry capture して `not_configured`                       |
| `CA019`（account deletion in progress、`assert_calendar_account_not_deleting_v1` 由来。5 RPC 全てがこの assert を通る） | definitive | 即終了、**Sentry capture しない**（アカウント削除中は想定内）。`not_configured` として扱う             |
| `40P01`（deadlock）/ `55P03`（lock not available）                                                                      | retryable  | 応答喪失と同じ扱いで同一引数 retry                                                                     |
| その他（network 例外、timeout）                                                                                         | retryable  | 同上                                                                                                   |

各 RPC は returns する discriminant 文字列（`'started'` / `'superseded'` / `'missing'` 等）をそのまま呼び出し側へ返し、意味付け（outcome へのマッピング）は呼び出し側に閉じる。

`p_project_key` は `resolveGoogleCalendarAuthorityIdentity()`（`authority-config.ts`、既存）から取得する。`null` を返す場合（authority config 未解決）は `not_configured` として扱う。

### 3. `sync-service.ts` の書き換え（`lifecycleVersion >= 2` 分岐のみ）

v0/v1（legacy）分岐は一切変更しない。`>= 2` 分岐のみ以下に置き換える:

- `loadConnection` の呼び出し + `runStartedAt = new Date()` を `begin_calendar_sync_run_v1` の 1 回の呼び出しに置き換える。DB が返す `run_started_at` を以後の全書き込みで使う単一の run 時刻とする。結果マッピング: `missing`→`not_configured`、`reauth_required`→`skipped_reauth_required`（既存と同じ）、`started`→続行（返り値の `data_generation` / `authority_fence_id` / `authority_epoch` / `sync_sequence` / `refresh_token_enc` を以後の CAS state として保持）。**`superseded`（critic 指摘、修正）**: project fence / quarantine fence の state が `ready` でない場合（全ユーザーに影響するグローバル状態）も含むため、`not_configured` に静かに畳まず **`captureUnexpectedError`（operation: `calendar_sync_fence_superseded`）を必ず打ってから** `not_configured` を返す。無音の全停止を防ぐ。
- token rotation（`persistCalendarTokenRotation` / `markCalendarConnectionReauth`）は別 migration 系列（`20260730090014_fenced_calendar_authority_writers.sql`）の別 RPC を使っており対象外。CAS 入力元を `begin_calendar_sync_run_v1` の返り値に差し替えるだけ。
- **`loadSelectedCalendars` の select に `id` を追加する（fact-checker 指摘、必須の前提修正）**。`CalendarRow` 型に `id: string` を追加する。`calendar_connection_calendars` は column-scoped grant のため、`id` が service_role に GRANT されているか実装前に確認する（`select('*')` は 42501 になる旨のコメントが sync-service.ts:497 にある）。
- `syncOneCalendar` 内の 410 cursor-invalid retry（`clearSyncToken`）を `clear_calendar_sync_cursor_command_v1` に置き換える。`cleared`→続行。**`superseded`（critic 指摘、修正）**: response-loss retry で 1 回目が commit 済みの場合、2 回目は `sync_token` が既に NULL のため `p_expected_sync_token` と不一致で `superseded` を返す（実際は成功している）。`superseded` を「既に clear 済みかもしれない」とみなし、`'failed'` にはせず `cursor: null` で続行する（full sync として進める。最悪でも無駄な full sync 1 回で、データ破壊は起きない）。`missing_selection` / `missing` は `'failed'`。
- `upsertActiveEvents` + `tombstoneEvents` + `sweepStaleEvents` + `saveSyncToken` の 4 呼び出しを `persist_calendar_sync_result_command_v1` の呼び出しに統合する。**chunk 化必須（critic 指摘、必須）**: RPC は `p_events` / `p_tombstone_event_ids` それぞれ 10,000 件上限、かつ provider_event_id が events/tombstone 間で重複すると `22023` で拒否する（migration:401-404, 460-464）。1 カレンダーの `result`（adapter が全ページ集約済み）を **1 chunk ≤ 2,000 events** で分割して複数回呼ぶ。呼び出し前に (a) `providerEventId` で events を dedupe（後勝ち）、(b) tombstone 配列から events に含まれる id を差し引く。**最終 chunk だけ** `p_tombstone_event_ids` / `p_used_full_sync` / `p_next_cursor` を渡し、それ以外の chunk は空配列 `false` `null` で呼ぶ。unit test で「重複 id が RPC へ到達しない」ことを固定する。**`superseded` / `missing_selection`（critic 指摘、修正）**: `superseded` は先行/後続 run との良性競合であり得る（`begin` は sync_sequence を毎回 +1、`replace_selected_calendars_command_v1` も +1 する）。これを `'failed'` に畳むと良性競合が「同期に失敗しました」としてユーザーに見える。`superseded` はこの run を静かに打ち切る専用の内部シグナル（既存の `CalendarSyncOutcome` に `'run_superseded'` を追加）とし、`calendarsFailed` に数えず `last_sync_error` も書かない。`missing_selection` は実失敗として `'failed'`。
- `writeConnectionError` / `writeConnectionSuccess` を `finish_calendar_sync_run_v1` に置き換える。`p_prune_window` は常に `false`。CAS 失敗（`superseded` / `missing`）は既存の `updateConnection` の best-effort 意味論（`captureDatabaseError` するが outcome は変えない）を維持する。

### 4. `connection-service.ts` の `updateSelectedCalendars` 書き換え（`lifecycleVersion >= 2` 分岐のみ）

同じ gate で分岐する。`>= 2` 分岐では、既存の upsert + delete + `deleteUnreferencedEvents`（`scope: {kind:'calendars', ...}`）を `replace_selected_calendars_command_v1` 1 回の呼び出しに置き換える。CAS 入力（`expected_generation` / `expected_authority_fence_id` / `expected_authority_epoch`）は `loadConnectionSecret` の呼び出しを拡張して読み取る。discriminant マッピング（critic 指摘、必須の欠落修正）: `updated`→成功、`missing`→`CONNECTION_NOT_FOUND`（throw）、`superseded`→`UPDATE_FAILED`（throw、再試行可能である旨をエラーメッセージに含める）。**未写像のまま無視すると選択変更が黙って消えるため、この 3 分岐は必須。**

**fail-open → fail-closed への意味論変化を受容する（critic 指摘、明記が必須）**: 現行の `deleteUnreferencedEvents` は best-effort（prune 失敗しても選択変更自体は成功）。RPC 側の anti-join DELETE は同一トランザクション内（`statement_timeout=30s`）のため、外したカレンダーの未参照ミラー行が多い場合に `57014`（timeout）で **選択変更ごと rollback** されうる。これは意図的に受容するリスクとして明記する（v0 分岐は従来の best-effort のまま残るため、影響は `>= 2` 分岐のみ）。`57014` / `40P01` は `UPDATE_FAILED`（再試行を促す文言）にマッピングする。

### 5. #2156(a): orphan grant revoke の未カバー経路

`route.ts` の outer catch（338-371 付近）は現状、`idToken` / `tokens.refresh_token` を try block 内の `const` として宣言しているため参照できない。これらを try block の外側で `let` 宣言し、解決した時点で代入する。outer catch 内で両方が代入済みなら、既存の 3 分岐と同じ形で `revokeOrphanedGrant` を best-effort 呼び出ししてから、既存のエラー分類・レスポンス生成を続行する。`GoogleOAuthError` 分岐・非分類分岐の両方に同じガードを適用する（token 交換自体が失敗した早期エラーでは `idToken`/`tokens` が未定義のままなので自然に skip される）。

### 6. #2156(b): docs/product/specs/external-calendar.md への反映

`docs-writing` skill に従い、以下 2 点を追記する: (a) account_delete pending settle 経路（独立 cron `/api/cron/calendar-account-deletion-settle`）、(b) OAuth 交換失敗時の orphan grant revoke（#2072、および本 plan で拡張する outer catch 経路）。

### 7. テスト

- `fenced-sync-writer.ts` の unit test（mock RPC client、各 discriminant 値のマッピングを固定）
- `sync-service.test.ts` / `connection-service.test.ts` に v1 分岐のケースを追加（既存 v0 ケースは変更しない）
- `apps/product/src/lib/test/integration/` に、兄弟 migration（`calendar-revoke-authority.integration.test.ts` 等）と同じ形式で `calendar-sync-writer.integration.test.ts` を新設する。必須ケース（critic 指摘、#2050 の受け入れ条件そのもの）: **`begin_calendar_sync_run_v1` 成功 → disconnect（connection 行 delete）→ `persist_calendar_sync_result_command_v1` / `finish_calendar_sync_run_v1` を呼ぶと `missing` が返り、`external_calendar_events` に新規行が 1 行も生えないこと**を assert する（begin 前の disconnect は現行でも壊れないので、begin 後の disconnect race を再現するのが本質）。加えて `finish_calendar_sync_run_v1` が `partial_timeout` を受理することを固定する
- #2156(a) の DB 障害 revoke テスト（issue 本文の指示どおり）

## Step Count

該当なし（UI フロー変更を含まない。sync engine の内部書き込み経路と 1 API route の catch 分岐の変更に留まる）。

## Reversibility Table

| Step                                                                      | Tag         |
| ------------------------------------------------------------------------- | ----------- |
| #2078 allowlist 追加 migration（`CREATE OR REPLACE`、非破壊）             | `[hours]`   |
| §0 terminal marker `_v3` migration + `external-lifecycle-version.ts` 拡張 | `[hours]`   |
| `fenced-sync-writer.ts` 新設                                              | `[minutes]` |
| `sync-service.ts` `>= 2` 分岐の書き換え                                   | `[minutes]` |
| `connection-service.ts` `updateSelectedCalendars` `>= 2` 分岐の書き換え   | `[minutes]` |
| #2156(a) outer catch の revoke 拡張                                       | `[minutes]` |
| #2156(b) docs 反映                                                        | `[minutes]` |
| テスト追加                                                                | `[minutes]` |

`[irreversible]` 要素なし。全て `git revert` で 5 分以内に戻せるか（app 層）、`CREATE OR REPLACE` の再 migration で戻せる（DB 層、データ削除を伴わない）。**destructive migration は本束に含めない**（dispatch 指示どおり）。**runtime kill switch は無く、rollback は revert + 再 deploy の 1 経路のみ**（critic 指摘）— `_v3` marker 適用後は次の deploy で sync trafficの 100% が新経路に切り替わる。デプロイ順序: allowlist migration → `_v3` marker migration → 型生成 → app deploy。順序を誤ると `partial_timeout` を書く run が `22023` 例外になる（definitive、retry されない）。

## Existing Code to Reuse

- `apps/product/src/features/external-calendar/server/account-deletion.ts` の `callRpc<T>`（167-190 行）— retry ループの骨格（応答喪失と rollback を区別せず同一引数で retry）をそのまま流用
- `apps/product/src/features/external-calendar/server/token-rotation.ts` の `DEFINITIVE_ROLLBACK_CODES`（20 行）— 確定失敗コードの分類パターンをそのまま流用（**fact-checker 訂正: `account-deletion.ts` ではなくこちら**）
- `apps/product/src/features/external-calendar/server/authority-config.ts` の `resolveGoogleCalendarAuthorityIdentity()` — `p_project_key` 解決に流用
- `apps/product/src/features/external-calendar/server/token-rotation.ts` の `createCalendarTokenRotationClient()`（102 行、名前も同一）— `fenced-sync-writer.ts` の client 生成に流用
- `supabase/migrations/20260730090054_mark_external_lifecycle_app_ready.sql` / `20260730090056_mark_external_lifecycle_app_ready_v2.sql` — `_v3` marker migration の雛形（terminal marker idiom）
- `apps/product/src/lib/test/integration/calendar-revoke-authority.integration.test.ts` 等の既存 fenced-writer integration test — 新規 integration test の雛形として流用
- `loadConnectionSecret`（`connection-service.ts`）— CAS 用カラム読み取りの拡張ベース

## What I'm Not Doing

- **`finish_calendar_sync_run_v1` の `p_prune_window` 統合はしない。** 既存の `deleteUnreferencedEvents`（window prune）は別の best-effort 経路として維持する。RPC 統合は fail-open/fail-closed の意味論を変える可能性があり、今回のスコープ（disconnect race の解消）に必須ではない。将来の別 issue で検討する
- **v0/v1（legacy lifecycle）分岐のコードは一切変更しない。** 分岐は並存させたまま、切り替えは `external-lifecycle-version.ts` 拡張後の `>= 2` gate に委ねる
- **PL/pgSQL 関数本体（CAS ロジック）の変更はしない。** #2078 の allowlist 追加、§0 の `_v3` marker 追加以外、5 RPC の実装ロジックには触れない（凍結資産）
- **destructive migration はしない。** 発生した場合は別 issue へ切り出す（dispatch 指示）
- **`revoke_orphaned_grant` の TOCTOU window（30秒）の是正はしない。** #2156(a) が対象とするのは「revoke 呼び出し自体が漏れている 2 箇所」のみで、既存の受容済み残余リスクには触れない
- **`replace_selected_calendars_command_v1` の大量削除ケース向けの batch 分割はしない。** RPC 本体は凍結資産で分割不可能（1 トランザクション設計）。`57014` timeout は受容済みリスクとして明記済み（§4）で、実測に基づく対処は別 issue とする

## dispatch 指示との整合（#2156 の束ね方について）

plan-critic は「#2050+#2078（revert 単位として不可分）と #2156（独立して revert したい変更）を分けるべき」と指摘した（`.claude/rules/workflow.md` §判定 3 問「壊れたら一緒に戻すか」）。**この plan では採用しない**: dispatch 記録（#2050 コメント、2026-08-20 夜、指揮台 Fable）が本束を明示的に「1 branch・1 PR」と指定しており、この判断は指揮台がドメイン単位（external-calendar 全体）で束ねる編成時点の決定である。revert 単位の懸念自体は妥当なので、実装時は #2156(a)/(b) を独立した commit に分け、束全体を revert せず該当 commit だけを revert できる状態を保つことで両立させる（`.claude/rules/workflow.md` §マージ方式「1 コミット単位で意味の通る粒度」に準拠）。指揮台へは plan-review 結果のポインタとして本判断を報告する。
