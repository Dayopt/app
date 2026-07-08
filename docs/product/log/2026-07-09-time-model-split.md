---
status: current
updated: 2026-07-09
---

# ADR-025: 時間管理モデルを Plan / Log / 外部カレンダーミラーの3概念に分割する

entries 単一テーブルを `plans` / `logs` / `external_calendar_events` に分割し、自動記録モデルを明示記録に反転する決定。[ADR-011](../../engineering/log/2026-03-05-unified-block-model.md) / [ADR-018](./2026-05-13-time-overlap-prohibition.md) / [ADR-019](./2026-06-10-auto-record-model.md) を supersede する。

## 背景・当時の前提

- 現行は `entries` 単一テーブル（ADR-011）に予定 range（`start_time`/`end_time`）と実績 range（`actual_start_time`/`actual_end_time`）が同居し、自動記録モデル（ADR-019）が read 時に effective actual を導出、重なりは二層 EXCLUDE 制約（ADR-018）で禁止していた
- ADR-018 / ADR-019 はともに「外部カレンダー同期時に再訪」を再訪条件として明記していた。Google Calendar 取り込み（ghost 経由、[strategy.md §4-3](../../business/strategy.md)）の設計に着手したため、この条件に到達した
- 現行モデルの限界が3つ顕在化していた: (1) 1予定に実績 1 range しか持てず「1つの予定に対する複数回の記録」が表現不能 (2) 自動転写された actual が KPI を歪める（見積もり精度指標は自動記録分を分母から除外して回避中） (3) `entries_effective` view と TS `getEffectiveActualRange()` の二重実装・同期義務

## 決定と理由

1. **entries を `plans` / `logs` に分割する**。`logs.plan_id`（nullable FK）で「予定に対する記録（1:N）/ 予定外の記録」を表現する
2. **記録のデフォルトを反転する**: 自動記録（過ぎた予定を実績とみなす）を廃止し、明示記録にする。過去の予定は記録されるまで「未記録の予定」として Review に一級概念で出す。緩和策として**ワンタップ「そのまま記録」と一括「この日を確定」を分割と同時に実装する**（これが無いと「軽く回す」が成立しない）。`skipped_at` は plans に存続させ「やらなかった」と「未記録」を区別する
3. **外部カレンダーは `external_calendar_events` = 同期ミラー**として取り込み、ghost は「ミラー − 変換済み − 却下済み」の**導出概念**とする。ghost はワンタップで Plan / Log に変換でき、無視すれば残らない
4. **重なりルールは ADR-018 の原則を継承する**: plans 同士・logs 同士は EXCLUDE で重複禁止（半開区間 `[)`・per-user・`deleted_at IS NULL` のみ対象）、plans × logs の重なりは許可、external は制約対象外。「緩和は実質不可逆（一度重なりを許すと再強化にデータ犠牲が伴う）」という性質も継承する

理由: 実績が全て本物のユーザー入力になり集計の歪みが消える。導出モデルの二重実装義務が消える。外部イベントが EXCLUDE 制約と衝突しない（ADR-018 が予告した正面衝突の回避策）。strategy §4-3「自動生成はゴーストまで。確定は人間のワンタップ」と一致する。

## 却下した選択肢と、なぜ捨てたか

- **entries 維持 + external だけ別テーブル** — 1:N 表現不能と二重実装義務が残り、限界 (1)(3) を解決しない
- **自動記録モデルの移植（分割後も read 時導出）** — 導出が2テーブル間に跨がって複雑化し、「未記録の予定」を Review の一級概念にできない（自動記録の世界では未記録 = 予定通り完了と区別不能）
- **予定作成時に記録行を仮作成** — ADR-019 の却下理由（書き込みの冗長性・不整合リスク・状態機械の複雑化）がそのまま有効
- **ghost の汎用テーブル化（AI / MCP / ルーティン由来も同居）** — 同期機構（provider upsert・sync cursor・window prune）は外部カレンダー固有で、混ぜると nullable だらけになる。ghost は表示概念とし、将来の別ソースは別テーブルから同じ ghost 表示層に合流させる

## 影響・やること

- ADR-011 / ADR-018 / ADR-019 に `status: superseded` を追記（[ADR-015 時間不変原則](./2026-03-10-time-immutability-principle.md) は存続。分割後はむしろ単純になる: plans は過去凍結、logs は訂正可）。**実装完了までの稼働中コードは旧 ADR の通りに動いている**（本ログは決定の記録であり、実装は未着手）
- Phase 1: plans / logs 分割 + 明示記録化。Phase 2: external ミラー + Google 同期（OAuth・カレンダー選択・sync cursor を持つ `calendar_connections` 相当が Phase 2 で別途必要）
- Migration では auto-record 済み entries（actual NULL・過去・未 skip）の effective actual を**移行時点で一度だけ実体化して logs 化**する（やらないと過去の Review が遡って「未記録」に変わる）
- 詳細設計: [docs/projects/time-model-split/overview.md](../../projects/time-model-split/overview.md)
