# Timeline Precision Redesign — Design Document

`docs/design/timeline-precision-redesign/overview.md` への保存を想定。元提案「精度の非対称設計 + Elastic Timeline」を critical review (`/plan-review` 2 agent 並列) に通し、3 つの独立 project に分割した修正版。

---

## 1. Context

Dayopt の Calendar は現在 **15 分グリッド固定 + 一律 hourHeight** で構築されている。元提案は次の 2 軸を同時に変えようとした。

1. **精度の非対称化** — drag/tap = 15 分スナップ、Inspector / テキスト = 1 分粒度
2. **Elastic Timeline** — 各時間スロットの視覚高さを「中身の量」で可変にする

レビューを通じて以下が確定した。

- **Elastic Timeline は不採用**（§ 2 / § 7）
- **精度の非対称化は採用**。ただし 9 step を 1 plan に統合する元案は大規模 plan の禁忌に該当するため、**3 つの独立 project に分割**
- **density indicator / overflow バッジは却下**（fragmentation 可視化は Watching AI / Insights の責務）

---

## 2. Elastic Timeline 不採用の根拠

5 観点で固定グリッド優位。詳細は § 7 Appendix。

| 観点                                  | Elastic                          | 固定グリッド        |
| ------------------------------------- | -------------------------------- | ------------------- |
| GAFA 整合（GCal/Outlook/Toggl）       | ✗                                | ◎                   |
| multi-day view 比較性（同時刻が同 y） | ✗                                | ◎                   |
| drag UX（線形 vs 非線形）             | ✗                                | ◎                   |
| fragmentation 知覚                    | ◎                                | ○（block 量で十分） |
| 実装工数                              | 5.5 day + multi-day 整合 1.5 day | 1.5 day             |

**目的（fragmentation 可視化）は Calendar UI ではなく Watching AI / Insights タブで解く。**

---

## 3. 検証済みの既存資産

`/plan-review` の fact-checker で全 path / signature / コメント文言を機械照合済み。修正版で参照する主要 path:

| Path                                                                                             | 役割                                                                                                           |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `src/features/calendar/interaction/time-math.ts`                                                 | `pixelsToTime(yPx, hourHeight, snapInterval=15)` / `snapToGrid` / `parseTimeString`（regex `^\d{1,2}:\d{2}$`） |
| `src/features/calendar/interaction/machine.ts`                                                   | drag / resize / longpress の 3 経路で `snapToGrid` を 8 箇所呼び出し                                           |
| `src/features/calendar/lib/entry-adapter.ts:14`                                                  | `snapMinutes()`（**TZ 丸め誤差吸収目的**、UI policy ではない）                                                 |
| `src/features/calendar/lib/grid.ts`                                                              | `MIN_EVENT_HEIGHT = 20px` / `roundToQuarterHour` / 独自の Date 版 `pixelsToTime`（snapInterval なし）          |
| `src/features/calendar/lib/layout.ts`                                                            | sweep-line column 配置（plan vs record 並列、撤廃禁止）/ `calculateMaxConcurrent`                              |
| `src/lib/stores/useCalendarSettingsStore.ts:30,47`                                               | `snapInterval: 5\|10\|15\|30`（既存 union に `1` を含むかが Project A の設計論点）/ `hourHeightDensity`        |
| `src/features/calendar/stores/useInlineCreateStore.ts`                                           | drag → `pendingSelection` → palette フロー（Project B で改修）                                                 |
| `src/features/entry/stores/useEntryInspectorStore.ts`                                            | open/close + anchor のみ。**時刻入力 UI は別 component**（Project A で path 確定が必要）                       |
| `src/features/calendar/components/views/shared/components/InlineTagPalette/InlineTagPalette.tsx` | drag 後の palette UI                                                                                           |

**元提案の誤認**（fact-checker で確定）:

- DB に 15 分制約は存在しない（`TIMESTAMPTZ` + GENERATED `duration_minutes`）
- ±5/±15 分チップ・長押し時間ピッカーは未実装（削除作業不要）
- `layout.ts` の sweep-line は plan vs record 並列描画用、撤廃禁止

---

## 4. Project A — `calendar-precision-asymmetry`

### Goal

drag / Inspector / tag tap の 3 導線で精度を直交化させる。drag で動かしても精度を破壊しない（precision regression を防ぐ）。

### Precision Policy（実装の出発点）

`useCalendarSettingsStore.snapInterval` は **user 設定の選択肢** であり、ここに `1` を入れると「drag を 1 分 snap にする選択肢」が UI に滲む。設計意図（drag は粗く、Inspector / text input のみ 1 分）を壊さないため、**1 分粒度は precision policy の内部定数として隔離する**。

新設 `src/features/calendar/lib/precision.ts`:

```ts
/** Inspector / text input 専用。drag snap には絶対に使わない */
export const INSPECTOR_TIME_PRECISION_MINUTES = 1;

/** drag / resize の default snap。store 未設定時のフォールバック */
export const DEFAULT_DRAG_SNAP_MINUTES = 15;

/** user setting で選べる drag snap の値域 */
export const ALLOWED_DRAG_SNAP_MINUTES = [5, 10, 15, 30] as const;
```

`useCalendarSettingsStore.snapInterval` の union は **現状の `5|10|15|30` のまま維持**。`1` を追加しない。

### 4.1 Inspector 時刻入力 component の所在（A-0 調査結果）

A-4 の対象として固定する path:

| Path                                                                   | 役割                                                                                    |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/features/entry/components/inspector/EntryInspectorForm.tsx`       | フォーム合成、TimeRow を 2 回呼び出し                                                   |
| `src/features/entry/components/inspector/fields/TimeRow.tsx`           | 予定行/記録行のラッパー                                                                 |
| `src/features/entry/components/inspector/fields/TimeSelect.tsx`        | PC/モバイル分岐、`<input type="text" readOnly>` + Popover/Drawer。**手入力は disabled** |
| `src/features/entry/components/inspector/fields/ClockTimePicker.tsx`   | モバイル時計盤 UI                                                                       |
| `src/features/entry/components/inspector/fields/useTimeCombobox.ts:16` | `SNAP_MINUTES = 15` ← **A-4 の主要変更点**                                              |
| `src/features/entry/components/inspector/hooks/useTimeFields.ts`       | scheduleDate / startTime / endTime 状態管理                                             |
| `src/lib/date/timezone.ts` の `localTimeToUTCISO`                      | HH:mm + base date → ISO 8601 変換、秒は `:00` 自動 padding                              |

**A-4 への含意**:

- 入力形式は HH:mm 文字列のみ（秒は `localTimeToUTCISO` が `:00` padding）
- `parseTimeString`（`^\d{1,2}:\d{2}$`）を流用、regex 拡張不要
- mutation shape は ISO 8601、変更不要
- `<input type="text" readOnly>` で手入力 disabled なので、1 分粒度を実現する方法は次の 3 択（**A-4 着手時に決定する OD**）:
  - **(a) dropdown 全 1440 オプション化** — 重い、UX 悪化、不採用候補
  - **(b) dropdown は 15 分プリセット維持、`readOnly` を外して手入力で 1 分粒度可** — Toggl 風、推奨
  - **(c) dropdown はそのまま、増減ボタン（±1 / ±5 / ±15）で 1 分粒度可** — Outlook 風、UI 面積大きい

→ **OD-2** (A-4 着手前): Inspector 1 分粒度入力の UX 方式（a/b/c）

### Minimum Viable Approach

| Step | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Code Reversibility | Data Side-effect                                                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------- |
| A-0  | Inspector の時刻入力 component の所在を調査・確定（**完了**、§ 4.1 参照）                                                                                                                                                                                                                                                                                                                                                                                                                                                     | minutes            | none                                                            |
| A-1  | `src/features/calendar/lib/precision.ts` を新設し上記 3 定数を export。`useCalendarSettingsStore.snapInterval` の union は触らない                                                                                                                                                                                                                                                                                                                                                                                            | minutes            | none                                                            |
| A-2  | drag / resize / longpress 3 経路を **relative offset snap** に統一。**source of truth は drag 開始時の `originalStartTime` / `originalEndTime`**（pixel から base time を再構成しない、DST / 丸め誤差を避ける）。pixel は `deltaY` の算出にのみ使う。helper の semantics: `newStart = originalStart + snapDuration(deltaMinutes, snapInterval)` / `newEnd = originalEnd + snapDuration(deltaMinutes, snapInterval)`。start/end の「分のズレ」は維持される。`machine.ts` の `snapToGrid` 呼び出し 8 箇所を新 helper 経由に置換 | minutes            | **irreversible: drag 後も 1 分粒度のオフセットが永続化される**  |
| A-3  | `entry-adapter.ts` の `snapMinutes` を **削除**する前に、`rg "snapMinutes\|roundToQuarterHour" src` で全 caller を列挙し、UI snap 目的で依存している caller が無いことを確認（コメント通り「TZ 丸め誤差吸収」だけが用途であることを実証）。確認後、責務分離した `truncateToMinute(date)`（秒・ms のみ 0 化）に置換。`tzIsSameDay` / `duration_minutes` 計算で秒以下のずれが日跨ぎ判定をフリップしないことを test で固定                                                                                                       | minutes            | none                                                            |
| A-4  | A-0 で確定した path の Inspector 時刻入力 component を 1 分粒度に。`parseTimeString`（`^\d{1,2}:\d{2}$`）を流用、HH:mm 入力で seconds 0 padding。`INSPECTOR_TIME_PRECISION_MINUTES` を直接参照                                                                                                                                                                                                                                                                                                                                | minutes            | **irreversible: ユーザーが任意の分粒度 timestamp を作成可能に** |
| A-5  | regression 自動 test 追加。`time-math.test.ts` に `snapInterval` 任意値ケース、`machine` test で「10:07 entry を drag で +30 分 → 10:37」の precision 維持ケース、`entry-adapter.test.ts`（新規）に DST 境界の `truncateToMinute` ケース                                                                                                                                                                                                                                                                                      | minutes            | none                                                            |

### Reversibility Note

**Code は revert 可能だが Data は revert 不可**。A-2 / A-4 で 1 分粒度の write が始まると、後から「5 分 snap に戻す」を選んでも既存の 10:07 entry は元に戻らない（10:07 → 10:00 / 10:15 への一括丸めは破壊的）。precision policy を `src/features/calendar/lib/precision.ts` の constant として固定し、policy 変更時は ADR を残す。

### Existing Code to Reuse

- `pixelsToTime` / `snapToGrid` / `parseTimeString`（time-math.ts）— signature 無改修
- `getEntryState`（temporal-constraints は触らない）
- `time-math.test.ts` の pure function test pattern

### What I'm Not Doing

- DB migration（不要、schema は既に分単位）
- Zod schema 変更（`multipleOf` は元々無い）
- modifier key で snap 解除（YAGNI、GCal も非対応）
- `grid.ts` の `roundToQuarterHour` は touch しない（caller 別調査が必要、本 project の scope 外）
- `grid.ts` の Date 版 `pixelsToTime` は touch しない（snapInterval 引数を持たないため、Project A の primitive 版経由に統一する作業は別 chore）
- `layout.ts` の sweep-line 撤廃（plan vs record 並列描画に必須）
- 過去ブロック編集制約（`temporal-constraints.md`）の変更

### Verification

```bash
npm run typecheck && npm run lint && npm run lint:boundaries
npm run test:run -- src/features/calendar/interaction/time-math.test.ts
npm run test:run -- src/features/calendar/lib/__tests__/layout.test.ts
npm run test:run -- src/features/calendar/lib/__tests__/entry-adapter.test.ts
```

手動 E2E:

- Inspector で 9:07-9:53 に変更 → DB に 1 分粒度で保存
- その entry を drag で 1 時間後に移動 → 10:07-10:53 になる（precision 維持）
- 既存の 15 分 snap 行を表示 → 表示破綻なし

---

## 5. Project B — `inline-create-instant-tap`

### Goal

Sidebar / Mobile footer の tag タップで「最速即作成」を実現し、Inspector との役割重複を解消する。

### Open Decision（実装前に確定）

**即作成時の `start_time` 決定アルゴリズム**を user に確認してから着手する。比較軸:

| 観点                            | α now（秒 0 化） | β 次の 15 分境界 | γ 直近の空きスロット |
| ------------------------------- | ---------------- | ---------------- | -------------------- |
| 即時性（「今からやる」体験）    | ◎                | ○                | △                    |
| 予測可能性                      | ◎                | ◎                | △                    |
| 実装コスト                      | ◎                | ◎                | ✗（衝突探索が必要）  |
| past/active 制約との相性        | 要明記           | ◎                | ○                    |
| grid 整列（13:07 開始の違和感） | △                | ◎                | ○                    |
| 研究者ペルソナとの相性          | ◎                | ○                | △                    |
| 誤作成時の修正コスト            | 中               | 小               | 中〜大               |

**Project B はこの decision が確定するまで halt**。

候補ごとの追加メモ:

- **α**: `start_time` は `truncateToMinute(now)`、`end_time = start_time + recentDuration`。`getEntryState` 上は `active`（`start <= now < end`）になる。Dayopt の「今この瞬間から始める」体験には最適だが、tap 後の Inspector 表示が `13:07-13:37` のような非 grid 値になる
- **β**: `start_time = ceil(now, 15min)`、`end_time = start_time + recentDuration`。grid clean だが now と start の間に最大 15 分のギャップが生じる（その時間は「未記録」になる）。`getEntryState` は `upcoming`
- **γ**: 衝突探索ロジックが追加で必要。MVP には重い

判断基準としては、**β を MVP として推奨し、α は Phase 2 で「Start now」明示ボタンとして別経路にする** が安全と思われる。決定は user の意思に委ねる。

### Minimum Viable Approach（decision 後に確定）

| Step | 内容                                                                                                                      | Code Reversibility | Data Side-effect                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------- |
| B-1  | 即作成 helper `createEntryFromTagTap(tagId, now, recentDurations)` を `src/features/calendar/lib/createFromTap.ts` に新設 | minutes            | none                                                        |
| B-2  | Sidebar tag tap / Mobile footer tap のハンドラを `useInlineCreateStore.openPalette` から helper 直呼びに切替              | hours              | **irreversible: tap だけで entry が永続化されるようになる** |
| B-3  | `useInlineCreateStore` の `pendingSelection` semantics（drag 経路用）を維持。即作成経路は store を経由しない              | minutes            | none                                                        |

### Existing Code to Reuse

- `useInlineCreateStore`（drag 経路はそのまま）
- entry の最頻 duration 推定 — `src/features/entry/lib/` 配下の既存集計があるか調査（無ければ最低限の rolling-window mode で実装）

### What I'm Not Doing

- popup 内の時刻入力 UI（出さない、これが Project の本体）
- drag 経路の改修（Project A の責務）
- 「直近の空きスロット」自動探索（α または β を採用する場合は不要）

### Verification

- Sidebar で「Deep Work」タグタップ → popup 出さずに即作成
- 作成された entry の start_time が decision のアルゴリズム通り
- drag 経路は影響なし（既存 stories で regression 確認）

---

## 6. Project C — `calendar-min-height-chore`

### Goal

`MIN_EVENT_HEIGHT` を 20px → 14px に下げる。1 分粒度 write 開始後の **短い entry の存在を視認できる** ようにする。

### 14px の根拠

14px は **block 内テキスト label の完全表示を保証しない**。1 分粒度書込が始まると 5-7 分 entry が現れるが、これらの block 内に「タグ名 + 時刻」を読ませることは現実的でない（5min × 1.2px/min = 6px の世界）。

→ 14px の目的は「**読ませる**」ではなく「**存在を潰さない**」。label 可読性は hover / Inspector / selected state で補完する。20px のままだと 5 分 entry も 20px に拡張されて隣接 entry を視覚的に押し下げ、「実際の duration」と「画面上の高さ」の乖離が広がる。14px で乖離を抑える。

### Approach

`src/features/calendar/lib/grid.ts:14` の 1 行変更 + Storybook の very-dense story 追加（1 時間 6 entry のケース）。Project A 完了後に独立 chore PR で実施。

### Reversibility

minutes（DOM 値の定数変更のみ、code/data 両方 reversible）

### What I'm Not Doing

- density indicator（却下、§ 7）
- overflow バッジ（却下、§ 7）
- block 内 label の可読性改善（別 issue。hover / Inspector が現状の補完手段）
- 既存 Story の variant 一括更新（必要に応じて個別対応）

---

## 7. 却下した代替案（記録のため）

### 7.1 Elastic Timeline — § 2 で詳述

multi-day view で同時刻が日ごとに異なる y 座標になる問題が致命的。chronotype zone（Deep Zone 等）の整合も崩れる。

### 7.2 density indicator + overflow バッジ

critic 指摘:「fragmentation の可視化」は Calendar grid ではなく Watching AI / Insights タブの責務。Calendar に「+N more」バッジを足しても、entry block の物理的な量で既に視認可能。Elastic を却下した代償としての over-engineering に該当。

→ **Calendar 側は density 表現を持たない**。fragmentation 可視化は Watching AI 設計時に Insights タブ側で再検討。

### 7.3 modifier key で snap 解除

GCal も非対応、Dayopt の個人 timeboxing target で需要なし。YAGNI。

---

## 8. グローバルに「やらない」リスト

3 project 横断で以下は本設計の scope 外:

- DB migration / Zod schema 変更
- ±5/±15 分チップ削除（実装が存在しない）
- 長押し時間ピッカー削除（実装が存在しない）
- `layout.ts` の sweep-line 撤廃（plan vs record 並列描画に必須）
- 複数 tag entry の導入（`entry_tags` UNIQUE 制約は維持。Project B の即作成も単一 tag entry を前提にする。複数 tag 対応は Watching AI 設計時に再検討、ADR 起票はその時）
- 過去ブロック編集制約（`temporal-constraints.md`）の変更
- `grid.ts` の `roundToQuarterHour` の caller 整理
- `grid.ts` の Date 版 `pixelsToTime` の primitive 版統合
- 新規 Zustand store 追加
- feature flag 導入（変更が小さく staging で検証可能）

---

## 9. 進行順序

1. **Project A** を最初に着手。A-0（Inspector 入力 component の所在調査）→ A-1（precision policy 新設）を済ませてから A-2 / A-4 に進む（**data 不可逆性の防御**）
2. **Project B** は Open Decision OD-1（即作成アルゴリズム）を user に確認してから着手
3. **Project C** は Project A の data write が始まった後（短い entry が現れてから）

各 project は独立 PR。Project A は A-0+A-1 / A-2+A-3 / A-4+A-5 の 3 PR に分割推奨（A-0 は調査結果を ADR 風メモで残し、A-1 と同 PR）。

---

## 10. 確定済み Decisions（2026-04-28）

| #   | Decision                            | 採用案                                                                                                                          |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | Elastic Timeline                    | 不採用、固定グリッド維持                                                                                                        |
| D-2 | Sidebar / Mobile footer tag tap     | 時刻編集 UI を出さない、即作成                                                                                                  |
| D-3 | entry と tag の関係                 | **現行の単一 tag model（`entry_tags` UNIQUE 制約）を維持**。複数 tag entry は導入しない。Watching AI 設計時に再検討             |
| D-4 | density indicator / overflow バッジ | 却下、Watching AI / Insights の責務                                                                                             |
| D-5 | plan の単位                         | 3 project に分割（A: precision、B: instant-tap、C: min-height chore）                                                           |
| D-6 | precision policy の置き場           | `src/features/calendar/lib/precision.ts` の constant + ADR。store union には `1` を入れない                                     |
| D-7 | drag の base time の source         | `originalStartTime` / `originalEndTime`（pixel から再構成しない、DST/丸め誤差回避）                                             |
| D-8 | 14px の意味                         | block 内 label を読ませる目的ではない。**短い entry の存在を視認** することが目的。可読性は hover / Inspector / selected で補完 |

未確定 Open Decisions:

- **OD-1** (Project B 着手前): 即作成時の start_time アルゴリズム
  - 推奨 MVP: **β（次の 15 分境界）**。grid clean、past/active 制約と相性良、誤作成時の修正コスト最小
  - 「Start now」が user にとって core 体験なら α を採用し、明示ボタンとして別経路化
  - 詳細比較は § 5 の OD 表参照
- **OD-2** (Project A-4 着手前): Inspector 1 分粒度入力の UX 方式（§ 4.1 参照）
  - (a) dropdown 全 1440 オプション化 / (b) dropdown は 15 分維持 + 手入力で 1 分（推奨、Toggl 風）/ (c) 増減ボタン（Outlook 風）

---

## 11. 次アクション

1. 本ファイルを `docs/design/timeline-precision-redesign/overview.md` に保存（保存済み）
2. **Project A** から着手。最初の PR は A-0 + A-1（Inspector 入力 component 所在調査メモ + `precision.ts` 新設）
3. Project B 着手前に OD-1 を user 確認
