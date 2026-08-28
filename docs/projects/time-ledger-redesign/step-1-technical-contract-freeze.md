---
status: current
last_verified: 2026-08-26
code:
  - apps/product/src/lib/date/timezone.ts
  - apps/product/src/features/timeblock/server/statistics-fetchers.ts
  - apps/product/src/features/timeblock/server/plan-guards.ts
  - apps/product/src/features/calendar/hooks/operations/useTimeblockOperations.ts
  - apps/product/src/features/activities/lib/category-colors.ts
  - supabase/schemas/010_tables_core.sql
  - supabase/schemas/017_tables_oauth.sql
  - supabase/migrations/20260729073124_mcp_stage1_revision_fence.sql
  - scripts/ci/check-destructive-migration.mjs
  - docs/engineering/invariants.md
---

# time-ledger-redesign — Step 1: 技術契約凍結（[#2396](https://github.com/Dayopt/dayopt/issues/2396)）

[overview.md](./overview.md) が定義する 8 段の安全な依存順（[#2395](https://github.com/Dayopt/dayopt/issues/2395) Codex A レビュー由来）の **第1段「技術契約凍結」** の成果物。issue #2396 本文「## 契約凍結」が列挙する 7 点を、overview.md と同一の8フィールド形式（`current contract / target contract / decision / effective milestone / data migration / compatibility / rollback / downstream blockers`）で凍結する。

本書は #2396 の完了条件「上記7点の技術契約が凍結されている」を満たす成果物であり、実装（runtime code / migration）は行わない。凍結後の sub-issue 起票は別途行う（issue #2396 完了条件どおり）。

Codex A（設計レビュー）は issue #2396 のコメント（2026-08-26）で実行・指揮台が全面採用済みのため本書では再実行しない。指揮台が file:line 主張 3 件を独立に直読確認（3/3 一致）した上で本レーンへ dispatch した。本レーン自身も残る主張を実測で再検証し（下記各節）、`/plan-review`（`plan-fact-checker` + `plan-critic` 並列）で plan を検証済み。

## 分類の根拠（誰が何を決めたか）

issue #2396 の dispatch コメント（2026-08-26、指揮台）は「7点のうち **User 裁可事項2点**（週の分母・8色のDB制約の意味）は、レーンが選択肢+証拠+推奨まで作って指揮台へ上げる」「**残り5点はレーンが技術判断として確定してよい**」と明示している。本書の T2〜T5・T7 が確定済みなのはこの指示に従った結果であり、レーン独自の判断ではない。**T1・T6 は 2026-08-26 に User 裁可が確定した**（正本: [issue #2396 コメント](https://github.com/Dayopt/dayopt/issues/2396#issuecomment-5421534203)）。両方ともレーン・指揮台の推奨どおりで確定した。

`/plan-review` の plan-critic は「T2（トリムidentity）・T4（Undo権限モデル）も CHECKPOINT 相当では」と指摘したが、上記 dispatch コメントが既にこの5点をレーンの技術判断として指定済みであるため、分類そのものは変更しない。ただし指摘の実質（将来の公開契約露出リスク・具体的数値の断定回避）は各節の `downstream blockers` へ反映した。

---

## T1. 週の分母（**採用（GO、2026-08-26 User 裁可）**）

- **current contract**: `apps/product/src` に週168hの除数としてのハードコードは存在しない（grep確認、ヒットは`192.168.0.0/16`関連のみ）。唯一の週境界計算は [`tzWeekEnd`](../../../apps/product/src/lib/date/timezone.ts#L182-L189) で、次週開始日の `23:59:59.999` を返す——**半開区間ではない**。呼び出し元は [`compute-date-range.ts:127-128`](../../../apps/product/src/features/review/lib/compute-date-range.ts#L127-L128) のみ（review機能の期間計算）
- **target contract**: v1.0 §3.4は節題が「**分母は**168時間」で、「余白チップを外せば**分母が**インク総量に切り替わる」とも書く（[v1-source.md:100](./v1-source.md#L100)）——168は表示文脈のみの記述ではなく、原文自身が168を分母と呼んでいる。ただし**DST週の扱いは原文が答えていない空白**（`overview.md` #9で既にDST未解決と明記済み）
- **decision（採用・確定、2026-08-26 User裁可）**: **Option A — 実経過時間の半開区間 `[local week start, next local week start)` を採用**。DST週（年2回）だけ分母が167h/169hになることを受け入れる。通常週50/52は168hのまま、UIの「168」という語の扱いは表示層の判断に委ねる
  - **根拠**: v1.0原文の空白（DST週の扱い）を埋める裁定として、台帳の帳尻（インク＝記録＋余白＝実経過時間）を優先した。Option B（名目168h固定）はDST週に「インク＋余白 ≠ 実経過時間」を生み、存在しない1時間の余白か消える1時間のどちらかを生む。台帳を名乗る以上、帳尻が実時間と合うことが原文の精神により忠実。加えてOption Bは第二の計上規則を必要とし、規則を増やす（Codex A指摘と同旨）
  - Option B（不採用）: 名目上のwall-clock 168hを常に使う場合、DST週の実際の経過時間との間に最大1hの説明不能な差分が生じ、将来「記録率」等の%指標を追加した時に分母の出典が曖昧になる
- **effective milestone**: #2396（本Step）で分母定義を確定、#2397（第一便）で実装
- **data migration**: 無し（新規計算ロジックのみ）
- **compatibility**: 無し（現行UIに168h除数の実装が存在しないため、破壊対象がない）
- **rollback**: `[minutes]`（計算ロジックのみ）
- **downstream blockers**:
  - **`tzWeekEnd`は新契約と非互換のため、新規実装では再利用しない。** `23:59:59.999`という閉区間的な値を返す現行実装をそのまま使うと、半開区間契約と矛盾したまま新しい分母計算に組み込まれる恐れがある。#2397着手時に`tzWeekEnd`を置き換えるか、新しい半開区間版ヘルパーを別名で追加すること
  - **既存の集計クリップ欠落バグを本Stepと同時に修正することを推奨。** [`fetchRecords`](../../../apps/product/src/features/timeblock/server/statistics-fetchers.ts#L49-L60)は`start_at`のみで期間フィルタし、`end_at`によるクリップを行わない。日曜23時開始・月曜7時終了のRecordは月曜開始週から丸ごと消える。本書の裁定対象（分母の定義）とは独立したdata correctnessバグのため、別issue [#2426](https://github.com/Dayopt/dayopt/issues/2426) として起票済み。分母の定義（半開区間）とクリップ実装は同じcanonical queryの一部になるため、#2397着手時に同時に直すことを推奨する

## T2. 中央トリム時の identity（分裂時の ID・Fulfillment・provenance の帰属）

- **current contract**: トリム（中央覆い）を行うcommandは存在しない。既存の更新は片端の伸縮のみで、1行を2行へ分裂させる操作は無い。fulfillment（`records.fulfillment`）は1行につき1値
- **target contract**: v1.0に明示的な分裂時identity契約は無い。issue #2396本文が要求するのは「1行が2行へ分裂する時のID・Fulfillment・provenanceの帰属」の決定（評価を両方へコピーするとnが2倍になる懸念、issue本文点2）
- **decision（確定）**: 時系列で早い側（開始時刻が元の行と一致する側）が元の`id`を継承し、遅い側（新たに生じた区間）が新規`id`を発行する。fulfillment評価は**identity を継承する側にのみ残し、複製しない**——新規側は`fulfillment IS NULL`から開始する（issue必須不変条件「未回答の充実は集計から除外」と整合、n二重化を構造的に防ぐ）。`source`・`provenance`は両側とも元の値をそのまま継承する（分裂は同一録の分割であり、由来は変わらない）。トリムのUndoは「分裂前1行 + 分裂後2行」を1つのeffect set（T4参照）として扱い、all-or-nothingで復元する
- **effective milestone**: #2396（本Step、契約凍結）→ 実装はtrim command新設Step（overview.md 8段中の第4段）
- **data migration**: 無し（新機能のため既存データへの影響なし）
- **compatibility**: 無し（現行MCP `records.*` にトリム操作は存在しない）
- **rollback**: `[minutes]`（契約の記述のみ、実装前）
- **downstream blockers**: **将来のMCP公開契約への露出は本書の裁定対象外、実接続0件の間は低リスク。** `id`の継続/新規発行という選択は、将来MCPが`records.*`の一部としてトリム結果を返す場合に外部クライアントから観測されうる。ただし現状MCP実接続は0件（`docs/engineering/invariants.md`実測、overview.md #4/#16と同一根拠）のため、overview.md #4/#16が採った「実接続0件の間は破壊的変更コストなし」という前例と同じ扱いとする。#2399（第三便、MCP公開契約見直しと同じStep）着手時に、この継続ルールをMCP契約としても明示するかどうかを再訪する

## T3. 後勝ちの直列化順

- **current contract**: `private.timeblock_user_revisions`（[migration:14-16](../../../supabase/migrations/20260729073124_mcp_stage1_revision_fence.sql#L14-L16)）は**opaque invalidation token**であり、コメントに明記のとおり「user-visible changeの計数ではない」——行レベルの勝者決定には使えないキャッシュ無効化マーカーである。実際に単一行の書き込み競合を裁定しているのは[`plan-guards.ts`の`assertOptimisticLock`（L45-51）](../../../apps/product/src/features/timeblock/server/plan-guards.ts#L45-L51)で、`expectedUpdatedAt`が現在値と不一致なら**成功ではなくエラー**を返す。つまり現行は「後勝ちで上書き」ではなく**fail-closed・先勝ち＋明示コンフリクト**モデルである。MCP側は`mcp_mutation_receipts`の`(user_id, client_id, operation_id)`複合PKで冪等性を担保する
- **target contract**: issue本文は「後」の定義（client timestamp / request arrival / lock acquisition / commit のどれか）と、同一operation IDの再送を新しい「後勝ち」にしない規則、直列化のスコープ（user全体かuser×laneか）の決定を要求する
- **decision（確定）**: 単一行の既存fail-closedモデルは**維持する**（これは「後勝ちで上書きする」問題ではなく、既に正しく解決済みの強みである）。issue本文が実際に問う「後」の定義は、**トリム・Undo等の複数行にまたがる複合操作**へ同じ規律を拡張する際に必要になる:
  - 「後」= **トランザクションcommit順**（PostgreSQL MVCCが権威）。client timestamp（クライアント時計は信頼できない）・request arrival（ネットワーク順序の入れ替わりがある）・lock acquisition（獲得後にabortしうる）のいずれも採用しない
  - 複数行操作（トリム・Undo）は、単一行CASを**同一トランザクション内の複数行CAS**へ拡張する形で実装する（全行が期待どおりの`updated_at`を持つ場合のみ全体をcommit、1行でも不一致ならall-or-nothingで失敗）
  - 冪等性はMCPの`operation_id`方式をdomain command全般へ拡張する。同一`operation_id`での再送は新しい「後」のイベントとして扱わず、最初の結果をそのまま返す
  - 直列化スコープは**現行どおりuser全体**を維持する（`timeblock_user_revisions`がuser単位である設計を踏襲）。user×laneへの細分化はトリムがplan/record両laneにまたがりうるため、かえって競合検出漏れを生むリスクがあり採用しない
- **effective milestone**: #2396（本Step、契約凍結）→ 実装はtrim/undo各commandの実装Step
- **data migration**: 無し
- **compatibility**: 無し（既存の単一行CAS挙動は変更しない）
- **rollback**: `[minutes]`
- **downstream blockers**: 無し

## T4. Undo の effect set・TTL・権限

- **current contract**: `mcp_mutation_receipts`（[schema:178-193](../../../supabase/schemas/017_tables_oauth.sql#L178-L193)）は単一`resource_id`/`resource_version`（timestamptz）のみを持つ監査用receiptで、before-imageもeffect setも持たない。UI側のUndo（[`useTimeblockOperations.ts:68-88`](../../../apps/product/src/features/calendar/hooks/operations/useTimeblockOperations.ts#L68-L88)）はtoastのアクションから旧`start_at`/`end_at`を再度updateするだけの単純な逆操作で、複数行操作やfield単位の復元には対応しない
- **target contract**: issue本文点4「multi-resource receipt（before imageとeffect setを持つ）。権限は「現在の権限 ∩ 元操作時の権限上限」。revoke済みconnection/期限切れtokenではUndo不可。**field mask単位で戻す（行全体を復元しない）**」——この定式化自体が issue本文の要求であり、本書はこれを技術契約として確定する（Codex P1-4/P1-5の指摘とも一致）
- **decision（確定）**:
  - **effect set**: 1つのUndo可能操作を「複数resource × フィールド単位のbefore/after image」の集合として記録する新しいreceipt構造を新設する（既存`mcp_mutation_receipts`の単一resource版を置き換えるのではなく、domain command全般向けに汎化する）
  - **権限**: Undo実行時点で、「Undo実行者の現在の有効権限」と「元操作の記録時点の権限上限」の**交差**のみを許可する。revoke済みconnection・期限切れtokenでは、たとえreceiptが有効期間内でもUndo不可（issue本文の明文どおり）
  - **field mask**: 復元は元操作が変更したフィールドだけに限定する。行全体のsnapshot復元はしない——Undo実行までの間に他フィールドへの正当な変更があった場合、それを巻き戻さないため
  - **TTLは具体的な数値をここでは確定しない**。監査保持（既存`mcp_mutation_receipts`の90日）とは別に、Undoとして**実行可能**な期間はそれより短い可動域を持つべきだが、具体的な時間数はUXの実装判断であり、#2397/#2399のいずれかの実装Step着手時に決定する。本書が固定するのはあくまで「TTLは監査保持期間より短く、独立した値である」という契約構造のみ
  - **競合時の扱い（訂正、#2443）**: Undo自体も通常の書き込みとして現在のRLS/CAS（T3参照）を通すが、**CAS判定の対象はfield mask内のフィールド（元操作が変更したフィールド）に限定する**。field mask外のフィールドへの正当な変更はUndoを妨げない。field mask内のフィールドの**現在値が、receiptのafter imageと異なれば**Undoはall-or-nothingで失敗する（部分復元はしない）。**これは値比較であり`A→B→C→B`のABAは検出しない**——「元操作後に一度も変更されていない」ことを保証する契約ではない（文字どおりの履歴検出が必要になった場合はper-field revisionが要るが、この段では採らない）。mask-only CASを適用してよいのは`update` effectに限る（`insert` effectの逆操作は行全体の削除になるため、mask外の後続編集ごと消える。この点の扱いは第3段の設計判断のため#2434へ委ねる）。この限定により、上記field maskの導入動機（field mask外の正当な変更を巻き戻さない）とCASが両立する——**旧記述「対象行のいずれかが元操作後に変更されていれば」は行全体を判定対象とする表現で、field maskの存在意義（行全体のsnapshot復元をしない）と矛盾していた**（Codex A の設計レビュー指摘・#2443で発見・訂正）。**訂正の訂正（PR #2459クロスレビュー P2、指揮台）**: 上記「元操作後に変更されていれば」も履歴検出を約束する表現だったため、値比較+ABA非検出の明示へ再訂正した。#2434（台帳第3段、Codex設計レビュー指摘8と同一論点）がこの文書を一次情報として読むため、値比較実装（per-field revision列を追加しない）とABAを検証対象に含めることを申し送る
- **effective milestone**: #2396（本Step、契約凍結）→ 実装はUndo substrate新設Step（overview.md 8段中の第3段）
- **data migration**: 無し（新規テーブル追加、既存`mcp_mutation_receipts`は監査用として維持）
- **compatibility**: 無し（新規substrate）
- **rollback**: `[minutes]`（契約の記述のみ）
- **downstream blockers**: 無し

## T5. Proposal accept の状態機械

- **current contract**: `external_calendar_events`（[schema:118-135](../../../supabase/schemas/010_tables_core.sql#L118-L135)）は`status TEXT`・`dismissed_at TIMESTAMPTZ`のみを持ち、明示的な状態遷移カラムは無い。convert（確定）操作のexactly-once保証は明文化されていない
- **target contract**: v1.0は「提案＝ゴースト」という概念を提示するが、状態機械の詳細（payload version、provider identity、accept generation、exactly-once）はv1.0本文に無い。issue本文点5がこれを要求
- **decision（確定、状態機械の契約のみ。テーブル形状はoverview.md #15が既に#2399実装判断へ委譲済みのため本書では確定しない）**:
  - 状態は `pending → accepted | rejected | expired` の3終端を持つ状態機械とする
  - `payload_version`: 提案元（GCal等）から取得したペイロードのバージョンを記録し、再取得のたびに変化があれば新しいpendingとして扱う（古いacceptedを上書きしない）
  - `provider identity`: どの外部connection/providerが発行したProposalかを記録する（`connection_id`相当、revoke時の扱いはT4の権限交差と同じ規律に従う）
  - `accept_generation`: 同一Proposalに対する複数回のaccept試行を区別するカウンタ
  - **exactly-once**: 同一`operation_id`（T3のdomain command冪等性拡張と同じ仕組み）でのaccept再送は、同じ結果（同じresource）をそのまま返す。新しいPlan/Recordを重複生成しない
  - `now()`はacceptトランザクション内で一度だけ固定する（Codex P2-9が指摘した「日付跨ぎで最初はPlan、再送はRecordになる」失敗シナリオを防ぐ）
- **effective milestone**: #2396（本Step、状態機械の契約）→ #2399（第三便、テーブル形状と実装）
- **data migration**: `external_calendar_events`を汎用Proposalへ拡張する場合のmigrationは#2399着手時に判断（overview.md #15の既存決定を継承、ここでは変更しない）
- **compatibility**: 現行`listEvents`/dismiss挙動は維持する（overview.md #15と同一）
- **rollback**: `[minutes]`（契約の記述のみ）
- **downstream blockers**: #2399（storage設計、overview.md #15参照）

## T6. 8色の DB 制約の意味（**採用（追加制約なし、2026-08-26 User 裁可）**）

- **current contract**: `categories.color`（[migration:60-63](../../../supabase/migrations/20260818120000_add_activity_category_tables.sql#L60-L63)）は10色enumのCHECK制約・**nullable**・**per-user uniqueness制約なし**・カテゴリー件数の上限なし。`CATEGORY_COLOR_NAMES`（[category-colors.ts:25-38](../../../apps/product/src/features/activities/lib/category-colors.ts#L25-L38)）が同じ10色をTypeScript側で定義する
- **target contract**: v1.0 §4.3「8はライト／ダーク両モード…全条件で判別が保証できる実務上限」。この文言は**トークン数**（8色に絞る）を語っており、per-user一意性やカテゴリー件数上限には触れていない
- **decision（採用・確定、2026-08-26 User裁可）**: 以下4点セット
  1. **トークン数=8**（10→8への縮小）: **overview.md #1で既にUser裁可済み（GO、2026-08-26）**。本書はこれを再確認するのみ
  2. **per-user色一意性: 導入しない**。根拠: (a) v1.0に要求なし (b) 既存の非一意データへの不可逆な再割当てを強制しうる (c) 8カテゴリー超の事実上の禁止という副作用もある
  3. **カテゴリー件数上限: 導入しない**。根拠: v1.0に記述なし。新規の製品制限でありscope外
  4. **null（色未設定）: 現行どおり許容する（nullable維持）**。根拠: v1.0にnull禁止の要求はなく、現行schemaも既にnullable。未設定時の表示規則（どのグレー/パターンで描画するか等）はUI契約側の判断に委ねる技術的な補足事項であり、本書はDB制約の意味としては「nullable維持」を確定するに留める
- **effective milestone**: #2396（本Step、契約凍結）。色再割当てロジックの実装は#2396着手時（overview.md #1・#14と同一Step）
- **data migration**: 既存10色のうち縮小対象となる色を使うカテゴリーの再割当てが必要（overview.md #14と同一Step、`[hours]`）
- **compatibility**: 色token（`--category-*`）の削除はStorybook等に影響（overview.md #1と同一）
- **rollback**: `[hours]`
- **downstream blockers**: 無し（他項目には波及しない）

## T7. forward-only 宣言

- **current contract**: 明示的なforward-only宣言は存在しない
- **target contract**: issue本文点7「semantic rollbackが不可能な範囲を明示する。`plan_id`廃止後は旧モデルへ機械的に復元できない」
- **decision（確定）**: overview.md #10（`plan_id`個別リンク廃止、User裁可GO・`[days]`不可逆）の実行後、**旧`plan_id`ベースのPlan↔Record個別対応は機械的に復元できない**と明示する。これ以降のforward-onlyポイントは以下のとおり:
  - `plan_id`列drop（実行判断は#2396着手時、上記T2/T14参照）以降、code revertでは復元できない
  - `skipped_at`廃止（overview.md #14）に伴うデータ削除も同様にforward-only
  - **backup restoreはrollbackではない（訂正、#2443）**: forward-only後にsemantic rollback（コード側で旧`plan_id`個別対応を機械的に復元する手段）は存在しない。backup restoreは、`plan_id`列drop以降に新たに作成されたPlan/Recordをすべて失う**災害復旧手段**であり、rollbackとして扱ってはならない——**旧記述「巻き戻し手段はbackup restoreのみ」はbackup restoreをrollbackの一種として位置づけており誤りだった**（Codex A の設計レビュー指摘・#2443で発見・訂正）。#1971のstorage backupゲート運用は「不可逆cleanupを実行する**前**にbackupを取る」ためのものであり、「cleanup**後**に問題が発覚したら戻す」手段として設計されていない。cleanup実行後に問題が発覚した場合、実務上の対処はforward-only（新しいコードで対処する）に限られる。この訂正は#2439（第8段、不可逆cleanupのexplicit-authority裁可）の前提に影響するため、#2439着手前に反映済みであること
  - 8段中の**第8段（不可逆cleanup）は#2175と別のexplicit-authority issue/PRにする**（issue #2396本文の既定どおり、本書では変更しない）
- **effective milestone**: #2396（本Step、宣言の明記）。実行判断（drop/backfillの着手）は各実装Step
- **data migration**: 該当なし（宣言のみ）
- **compatibility**: 該当なし
- **rollback**: 該当なし（宣言そのものはdocsのみで`[minutes]`、対象となる実操作はoverview.md側で`[days]`と記録済み）
- **downstream blockers**: 無し

---

## Reversibility Table

| 項目                          | Reversibility | 備考                                                                                                          |
| ----------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------- |
| 本書（docsのみ）              | `[minutes]`   | git revertのみ                                                                                                |
| T1〜T7 いずれも（契約の記述） | `[minutes]`   | 実装はまだ行わない。実装時の不可逆性はoverview.mdの対応項目（#10・#14等）が既に記録済みで、本書では複製しない |

## Existing Code to Reuse

- `plan-guards.ts`の`assertOptimisticLock`（単一行CAS）を、T3の複数行CAS拡張の参照実装とする
- `mcp_mutation_receipts`の`(user_id, client_id, operation_id)`複合PK冪等性パターンを、T3・T5のdomain command全般への冪等性拡張の土台とする
- overview.mdの8フィールド形式をそのまま踏襲（本書で新規に形式を作らない）

## What I'm Not Doing

- runtime code / migration の実装をしない（issue #2396完了条件どおり、凍結のみ）
- sub-issue起票をしない（本書freeze後に別途行う）
- `docs/engineering/invariants.md`の追記を今行わない（overview.md §8supersede mapの既定どおり「各Step着手時」に実施する。invariants.mdは実コードで既に強制されている契約のカタログであり、未実装の目標契約を混在させると「不変条件」の意味が崩れる）
- T5のProposalテーブル形状を確定しない（overview.md #15が既に#2399実装判断へ委譲済み、本書は状態機械の契約のみ）
- fetchRecordsのクリップ欠落バグの実装修正をしない（別issue [#2426](https://github.com/Dayopt/dayopt/issues/2426)、本書はT1のdownstream blockerとして言及するのみ）

## 検証

- `pnpm docs:check` が green（frontmatter・リンク・命名規約）
- 7点すべてが8フィールド（current/target/decision/effective milestone/data migration/compatibility/rollback/downstream blockers）を記載していること
- T1・T6 は 2026-08-26 に User 裁可（[issue #2396 コメント](https://github.com/Dayopt/dayopt/issues/2396#issuecomment-5421534203)）が正本として存在した上で「確定」表記へ更新されていること（裁可なしの確定表記書き換えではないこと）

## 関連

- [issue #2396](https://github.com/Dayopt/dayopt/issues/2396) — 本書を成果物とする契約凍結issue、Codex Aレビューコメント、dispatchコメント
- [overview.md](./overview.md) — v1.0設計正本化（#2395）、8段の安全な依存順、T2/T6が参照する#1・#10・#14・#15の既存裁定
- [issue #2426](https://github.com/Dayopt/dayopt/issues/2426) — 本書の作業中に発見した独立バグ（fetchRecordsのクリップ欠落）
- [issue #1971](https://github.com/Dayopt/dayopt/issues/1971) — backup gate運用の前例（T7が参照）
- [.claude/rules/decision-principles.md](../../../.claude/rules/decision-principles.md) — Rule 1「破滅に賭けるな」（T7が参照）
