---
status: active
last_verified: 2026-08-18
code:
  - apps/product/src/features/tags
  - apps/product/src/features/calendar/components/tag-filter
  - apps/product/src/features/timeblock/server
  - supabase/migrations
  - docs/product/specs/tags.md
---

# tag-model-replacement — タグを アクティビティ / カテゴリー / セグメント の 3 構造へ全置換する

[epic #2162](https://github.com/Dayopt/dayopt/issues/2162) で User が裁可した 3 構造モデルを、スキーマ・UI・分析・用語・移行順序へ落とす全体設計書。**大規模判定**（新テーブル 4 本、blast radius が tags / calendar / timeblock / review / MCP / OAuth / design token 横断、想定 Step 9）。

決定の経緯と確定仕様は epic #2162 が正本で、本書はそれを実装計画に翻訳する。進捗・残作業は epic 側に置き、本書には設計と理由だけを書く（`.claude/rules/workflow.md` §issue と docs の分担）。

---

## 1. Goal

「所属（集計の足し算が合う軸）」と「横断参照（分析の軸）」を別々の構造に分離し、カテゴリー別集計が実時間と一致することを構造で保証したデータモデルへ、タグ機構を全置換する。

## 2. Minimum Viable Approach

骨格は 4 手。ここに含まれないものは §11 で明示的に却下する。

1. **新スキーマを純追加する** — まず `categories` / `activities` を作り、`plans` / `records` に `activity_id` を足す。この時点で `tags` は無傷。`segments` / `segment_activities` は分析軸を作る Step 5 まで遅らせる（所属軸だけで §3 の不変条件は成立するため）
2. **runtime の正を activity へ切り替える**（cutover） — サイドバー・作成/編集・カレンダー表示を activity 基準にする。既存ブロックは「アクティビティなし」になる（データ移行しないという裁可の帰結）
3. **分析軸と公開契約を追従させる** — カテゴリー rollup・セグメント・MCP・OAuth scope・GDPR export・公開 docs
4. **非破壊 cleanup → destructive migration の順で tags を消す** — 消す作業だけを最後の独立 Step に隔離する

データ移行を伴わないため、[time-model-split](../_archive/time-model-split/overview.md) が必要とした backfill・突合・互換 view は**すべて不要**。残る移行リスクは deploy 間隙（新旧アプリが同時に動く窓）だけで、これは「純追加 → cutover → drop」の順序だけで閉じられる。

## 3. なぜ 3 構造か（設計の芯）

現行の tags は 1 つの機構に 2 つの役割を載せている。この project の全設計判断はここから導かれる。

| 役割           | 求められる性質                                      | 3 構造での担当                           |
| -------------- | --------------------------------------------------- | ---------------------------------------- |
| 所属           | 1 つの時間が 1 か所にだけ数えられる。合計が濁らない | **カテゴリー**（単一所属、FK 1 本）      |
| 横断参照       | 1 つの時間が複数の観点から参照されてよい            | **セグメント**（多対多、junction table） |
| 予定と記録の口 | 無限に増えてよい。作る摩擦がほぼゼロ                | **アクティビティ**（葉）                 |

**この分離を「規約」ではなく「構造」で担保する**のが本設計の主眼:

- 所属は `activities.category_id` という**列 1 本**で表す。中間テーブルにしないから、多重所属が事故でも入らない
- 横断参照は `segment_activities` という junction で表す。**`plans` / `records` にセグメントを指す列は作らない**。だからセグメントは第 2 の分類軸に育ちようがなく、「分析の軸」に留まる

### 検証可能な不変条件

カテゴリー軸の集計は、この 2 式が常に成り立つ。実装後に単体テストで凍結する（`.claude/skills/test/SKILL.md`）。

```
Σ(各カテゴリーの時間) + 未分類バケットの時間 = 対象期間の全ブロック時間
Σ(各アクティビティの時間) + アクティビティなしの時間 = 対象期間の全ブロック時間
```

セグメント軸ではこれが成り立たない（重複しうる）。だから **セグメントの合計は出さないし、円グラフにもしない**（§6-3）。

## 4. DB schema 設計

PostgreSQL 17（`supabase/config.toml:44` の `major_version = 17`）を前提にする。複合外部キーと列指定 `ON DELETE SET NULL`（PG 15+）が使えることが、後述の所有者整合の設計を成立させている。

### 4-1. categories

| カラム                 | 型               | 制約                                    |
| ---------------------- | ---------------- | --------------------------------------- |
| id                     | uuid PK          | `gen_random_uuid()`                     |
| user_id                | uuid NOT NULL    | FK → `auth.users`、ON DELETE CASCADE    |
| name                   | text NOT NULL    |                                         |
| color                  | text NOT NULL    | 10 色パレットの色名。CHECK で値域を固定 |
| icon                   | text NULL        | curated icons の Lucide 名              |
| archived_at            | timestamptz NULL |                                         |
| created_at, updated_at | timestamptz      | `update_updated_at()` トリガーを流用    |

- `UNIQUE (id, user_id)` — 複合 FK の受け皿。実データ上は冗長だが、これが無いと 4-4 の所有者整合が書けない
- `UNIQUE (user_id, name) WHERE archived_at IS NULL` — 通常カテゴリー名の一意。既存 `tags_user_root_name_unique` と同じ部分 unique index の形
- **`parent_id` を持たない。** 階層は構造的に発生しないので、現行の `check_tag_hierarchy()` / `check_tag_has_children()` の 2 トリガーが不要になる。深さ制約をトリガーで守る必要がなくなるのが、2 階層固定を「列を作らない」ことで表現する利点

### 4-2. activities

| カラム                 | 型               | 制約                                    |
| ---------------------- | ---------------- | --------------------------------------- |
| id                     | uuid PK          |                                         |
| user_id                | uuid NOT NULL    | FK → `auth.users`、ON DELETE CASCADE    |
| category_id            | uuid NULL        | **NULL = 未分類。これが単一所属の表現** |
| name                   | text NOT NULL    |                                         |
| archived_at            | timestamptz NULL |                                         |
| created_at, updated_at | timestamptz      |                                         |

- `UNIQUE (id, user_id)`、`UNIQUE (user_id, name) WHERE archived_at IS NULL`
- `FOREIGN KEY (category_id, user_id) REFERENCES categories (id, user_id) ON DELETE SET NULL (category_id)`
- **色・アイコンを持たない**（§4-6）

### 4-3. segments / segment_activities

| segments               | 型            | 制約                                 |
| ---------------------- | ------------- | ------------------------------------ |
| id                     | uuid PK       |                                      |
| user_id                | uuid NOT NULL | FK → `auth.users`、ON DELETE CASCADE |
| name                   | text NOT NULL | `UNIQUE (user_id, name)`             |
| created_at, updated_at | timestamptz   |                                      |

`UNIQUE (id, user_id)` を持つ。

| segment_activities | 型            | 制約 |
| ------------------ | ------------- | ---- |
| segment_id         | uuid NOT NULL |      |
| activity_id        | uuid NOT NULL |      |
| user_id            | uuid NOT NULL |      |

- `PRIMARY KEY (segment_id, activity_id)`
- `FOREIGN KEY (segment_id, user_id) REFERENCES segments (id, user_id) ON DELETE CASCADE`
- `FOREIGN KEY (activity_id, user_id) REFERENCES activities (id, user_id) ON DELETE CASCADE`

**この 2 テーブルは Step 1 では作らず、実際に使う Step 5 で作る。** 所属軸（categories / activities）だけで §3 の不変条件は成立し、セグメントはそれに乗る分析専用の構造なので、先に作っても使い道が無い。

セグメントは**アクティビティだけを束ねる**。カテゴリーを直接メンバーにできない — カテゴリー単位の合計は rollup で既に出るので、両方を許すと「同じ数字への 2 つの道」を作ることになる。

### 4-4. 所有者整合（トリガーを 1 本も足さない）

現行は `plans.tag_id` / `records.tag_id` の持ち主一致を **CONSTRAINT TRIGGER で守っている**（`enforce_plan_tag_owner()` / `enforce_record_tag_owner()`、`supabase/migrations/20260708232500_add_time_model_tables.sql`）。新モデルでは同じ保証を**宣言的な複合 FK で置き換える**。

```sql
-- plans / records いずれも同型
ALTER TABLE public.plans
  ADD COLUMN activity_id uuid,
  ADD CONSTRAINT plans_activity_owner_fkey
    FOREIGN KEY (activity_id, user_id)
    REFERENCES public.activities (id, user_id)
    ON DELETE SET NULL (activity_id);
```

- 他人の activity を指す行は**書けない**（トリガーの実行順序や `SECURITY DEFINER` の抜けに依存しない）
- 列指定 `SET NULL (activity_id)` が要る理由: 列を指定しないと `user_id` まで NULL にしようとして NOT NULL 違反になる
- `categories` / `activities` の `UNIQUE (id, user_id)` は、この複合 FK の参照先になるためだけに要る（PK が `id` 単独なので、複合 FK が参照できる一意制約が別に必要）。実データ上は冗長に見えるが、消すと本節の設計が成立しない
- これは `.claude/rules/workflow.md` §同型指摘の打ち切り が言う「点を塞ぐのではなく class ごと閉じる」に当たる。現行 tags は所有者整合のために `enforce_plan_tag_owner()` / `enforce_record_tag_owner()` の 2 関数を必要としているが、新モデルではこれが **0 本**になる

**一次資料で確認済み**: PostgreSQL 17 公式ドキュメント [Constraints > Foreign Keys](https://www.postgresql.org/docs/17/ddl-constraints.html) が、まさにこの形（テナント境界を複合 FK で守り、`ON DELETE SET NULL (author_id)` で必須列を NULL にしないようにする）を正規解として例示している。列リスト付き referential action は PG 15 以降の構文で、本環境は PG 17（`supabase/config.toml` の `major_version = 17`）なので使える。

### 4-5. RLS / GRANT

4 テーブルとも `tags` と同じ 4 ポリシー構成にする（`docs/engineering/data/db/rls-snapshot.md` の tags 節と同型）。

| 操作   | USING                           | WITH CHECK                      |
| ------ | ------------------------------- | ------------------------------- |
| SELECT | `(select auth.uid()) = user_id` | —                               |
| INSERT | —                               | `(select auth.uid()) = user_id` |
| UPDATE | `(select auth.uid()) = user_id` | `(select auth.uid()) = user_id` |
| DELETE | `(select auth.uid()) = user_id` | —                               |

- UPDATE に **最初から WITH CHECK を付ける**。tags では USING だけで作られ、2026-04-30 の `20260430000000_fix_tags_user_settings_update_with_check.sql` で後追い修正された不備がある。同じ穴を再現しない
- GRANT は `authenticated` / `service_role` にだけ与え、`anon` には与えない。tags は baseline 時代に `anon` へ過剰付与され、`20260810085344_revoke_excess_table_grants.sql` で剥がされている。新規テーブルで同じ経路を通らないよう、migration 内に GRANT を明示する（`.claude/rules/architecture.md` §ロジックの置き場「新規 table の migration は RLS + policy + GRANT を 1 セットでレビューする」）
- migration 適用後に `pnpm rls:snapshot` を再生成する（出力先 `docs/engineering/data/db/rls-snapshot.md`、CI が drift を検出する）

### 4-6. 色とアイコンはカテゴリーだけが持つ

**推奨（設計判断）**: 色・アイコンは `categories` のみが持ち、アクティビティは所属カテゴリーの色を継承する。未分類アクティビティのブロックは中立マーカー（現行 `TagIcon` の `isUncategorized`、`bg-muted` + `Minus`）を流用する。

- epic の確定仕様が「カテゴリー: 色とアイコンを持つ」と明記している
- 「アクティビティは無限に増えてよい。作成コストは激安のまま」を守るには、作成時に色を選ばせない方がよい。現行のタグ作成モーダルは名前・色・アイコン・親の 4 項目を要求している
- 同じカテゴリーのブロックが同じ色で並ぶので、カレンダーを見ただけで 1 日の構成が読める。タグごとに色が違う現行では成立しない見え方

**受け入れるコスト**: 未分類アクティビティのブロックはすべて中立色になる。全ブロックが灰色一色のカレンダーは体験として弱い。緩和は「カテゴリーを 1 つも作っていない時に空状態からカテゴリー作成を促す」で足りると見ており、アクティビティごとの色上書きは入れない（分類管理という新しい摩擦を作るため。[strategy.md](../../strategy.md) §4-2）。

### 4-7. 並び順 — `sort_order` を持たない

**推奨（設計判断）**: `sort_order` 列を作らず、名前順（locale 対応）で並べる。

epic は DnD 廃止を確定させている。ここで `sort_order` だけ残すと「DnD の代わりの並べ替え UI」が必要になり、context menu の上/下移動は DnD より手数が増える（[strategy.md](../../strategy.md) §4-9、`CLAUDE.md` シンプルルール 3）。名前順は UI を 1 つも必要としない。

この判断は可逆（[minutes]）。実使用で「睡眠を末尾に置きたい」のような要求が出たら列を足せばよく、先回りしない。

**撤去できるもの**: RPC `batch_reorder_tags_hierarchy` / `batch_reorder_tags` / `increment_tag_sort_orders`、`tag-reorder-service.ts`、`tag-sort-order.ts`、`useReorderTags`、`move-tag-tree.ts`、`TagFlatListDnd.tsx` / `SortableParentBlock.tsx` / `SortableTagItem.tsx`、そして **`@dnd-kit/core` / `@dnd-kit/sortable` / `@dnd-kit/utilities` の 3 依存**。

実測した import 元は 6 ファイル: tag-filter の 4 ファイル（`TagFlatList.tsx` / `TagFlatListDnd.tsx` / `SortableParentBlock.tsx` / `SortableTagItem.tsx`）と、**タグと無関係な開発用 playground 2 ファイル**（`app/[locale]/(app)/playground/dnd-tags/DndTagsPlayground.tsx`、`app/[locale]/playground/dnd-multi-container/MultiContainerPlayground.tsx`）。**後者を残したまま依存を撤去すると `typecheck` / `build` が壊れる。** 製品から DnD が消える以上 DnD の実験ページを残す理由も無いので、**両 playground をディレクトリごと削除して依存を落とす**（推奨）。残す判断をするなら依存も残り、`@dnd-kit` 撤去は Step 7 の成果から外れる。

申し送り: `rg @dnd-kit` を素朴に打つと 7 件ヒットするが、7 件目は `features/calendar/components/Calendar.docs.mdx:79` の**文中言及**（Storybook docs の技術説明）で import ではない。撤去時はここの記述も直す。

### 4-8. 削除・アーカイブの意味論

現行 spec（`docs/product/specs/tags.md`）の「時間データを消さない」原則をそのまま継承する。

| 操作               | 挙動                                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| カテゴリー削除     | 所属アクティビティは `category_id = NULL`（未分類化）。連鎖削除しない      |
| アクティビティ削除 | 参照する Plan / Record は `activity_id = NULL`（アクティビティなし）       |
| セグメント削除     | `segment_activities` が CASCADE で消える。アクティビティは無傷             |
| アーカイブ         | `archived_at` を立てる。選択候補から消え、過去のブロックの表示は変わらない |

**マージ（統合）は v1 で持たない**（§12 で User 判断を仰ぐ論点として再掲）。現行は `merge_tags_with_hierarchy` RPC + 墓標状態（`is_active = false`）+ 専用モーダル 3 ファイルという相応の実装を抱えているが、全とっかえでデータが引き継がれない以上、「重複タグを作ってしまった過去」も引き継がれない。改名 + アーカイブで代替し、実使用で需要が出たら別 epic にする。この判断により `is_active` 列と墓標状態そのものが不要になる（状態は「通常 / アーカイブ」の 2 つだけ）。

### 4-9. アーカイブ済みアクティビティの付与拒否

現行の多層防御をそのまま移植する。`assert_active_timeblock_tag_v1`（`ERRCODE DT014` → TS 側 `TAG_ARCHIVED`）に相当するものを `assert_active_timeblock_activity_v1` として作り、`private.create_plan_unserialized_v1` などから `PERFORM` する。**MCP 経路が TS 側の事前検証を持たず command 境界だけに委ねる**という現行の設計理由（再送が誤って拒否されるのを防ぐ）は変わらないので、そのまま引き継ぐ（`docs/product/specs/tags.md` の当該節）。

## 5. サイドバー IA

### 5-1. 確定仕様の実装形

```
┌─ カテゴリー: 仕事      (色ドット + アイコン + 折りたたみ)
│    ├ 開発
│    ├ ミーティング
│    └ レビュー
├─ カテゴリー: 学習
│    └ 英語
├─ 未分類                (見出し。カテゴリー未所属のアクティビティ)
│    ├ 運動
│    └ 家事
└─ アーカイブ済み        (折りたたみ。既定は閉)
```

- カテゴリー見出しに**チェックボックスを置かない**（epic 確定）。見出しは折りたたみと context menu だけを持つ
- **DnD なし**。カテゴリーの変更は各アクティビティの context menu「カテゴリーを変更」→ ピッカー
- **カテゴリーは既定で展開**。折りたたみ状態は localStorage に持つが初期値は開。閉じた状態を初期値にすると、アクティビティを押すまでの手数が 1 増える
- アクティビティのクリック = 予定を置く導線（現行の `useTagDraftStore` → カレンダー上の draft → 確定、を踏襲）

### 5-2. 「未分類」と「アクティビティなし」を混同しない

epic は「未所属のアクティビティは『未分類』として扱う」と確定させた。一方で現行 UI には**別の残余概念**がある — タグが付いていないブロック（現行の「タグなし」/ Review の「未分類」）。新モデルではこの 2 つが同時に画面へ出るので、語を分ける。

| 概念                                           | ja                     | en            | 出る場所                                                  |
| ---------------------------------------------- | ---------------------- | ------------- | --------------------------------------------------------- |
| カテゴリーに所属しないアクティビティ           | **未分類**             | Uncategorized | サイドバー見出し、カテゴリー別集計                        |
| アクティビティが設定されていない Plan / Record | **アクティビティなし** | No activity   | カレンダーのカード、Inspector、検索、アクティビティ別集計 |

現行が「タグなし」（カレンダー）と「未分類」（Review 集計行）で同じものを 2 通りに呼んでいる不統一も、ここで解消する。

### 5-3. フィルタ

`useCalendarFilterStore`（現行 355 行、persist version 7）は state の意味だけを差し替えて残す — フィルタ機構そのものは新モデルでも要る。

- `visibleTagIds` → `visibleActivityIds`、`showUntagged` → `showNoActivity`
- **persist の version を上げ、旧 state を捨てる migrate を書く**。タグ ID の集合を activity ID として読むと、全部が未知 ID になって「何も表示されない」状態でアプリが開く。version 8 で空集合へ落とす
- カテゴリー単位の一括表示切替は、見出しの context menu に「このカテゴリーだけ表示」を置く（現行の「このタグだけ表示」と同じ語彙）

### 5-4. 楽観的更新とクエリキャッシュ

現行 tags の mutation は **create / update / delete / reorder / merge / archive / restore のすべてが `onMutate` + `onSettled` を持つ**（`features/tags/hooks/useTagCrudMutations.ts` / `useTagArchiveMutations.ts` / `useTagMergeMutation.ts`）。新 feature でも同じ形を作る（`.claude/skills/optimistic-update/SKILL.md`）。移植時の注意:

- `useTagCrudMutations.ts:306` のコメントが記録している「`listHierarchy` も楽観更新しないと `onSettled` の invalidate → refetch で表示が巻き戻る」問題は、新モデルでは `activities.list` と「カテゴリー + 所属アクティビティ」の 2 クエリキーの間で**同型で再発する**。両方を楽観更新する
- `hooks/tagQueryKeys.ts` の `tagKeys` を `activityKeys` として作り直す。キー設計を移すだけで、構造は変えない
- `useTagsQuery.ts` が `select` を使っていないのは楽観的更新の検出を担保するためという既存の判断があるので、その理由ごと引き継ぐ
- **Realtime 競合対策は不要**。`postgres_changes` の購読はアプリコードに存在しない（`supabase_realtime` publication は空を期待値とする、`.claude/rules/architecture.md`）

### 5-5. store リネームの事故経路（過去に実際に起きた）

`useCalendarFilterStore` は Storybook の `STORE_REGISTRY` に登録されている（`apps/storybook/.storybook/mocks/stores.tsx:37`）。`.claude/rules/architecture.md` §Store リネーム / 移動 / 削除時のチェックリスト が記録している 2026-04-22 の事故（Storybook preview が無限リロードに陥る）と同じ経路なので、Step 4 では次を grep で確認する。**typecheck では検出できない**（`.storybook/` 配下の未 import ファイルが listFiles に乗らないため、grep が第一防衛線）。

- `.storybook/mocks/stores.tsx` の `STORE_REGISTRY` key と import path
- `.storybook/decorators/` からの直接参照
- Story の `parameters.storeMocks` キー
- feature barrel の re-export

`useTagDraftStore` は削除するので、上記の登録が残っていないかも同時に見る。

## 6. 分析（statistics / review）への影響

### 6-1. 集計軸が 1 本から 3 本になる

| 軸               | 何に使うか                           | 合計の性質       |
| ---------------- | ------------------------------------ | ---------------- |
| アクティビティ別 | 最も具体。見積もり精度の単位         | 分割（重複なし） |
| カテゴリー別     | 1 日 / 1 週の構成比                  | 分割（重複なし） |
| セグメント別     | 横断的な問い（「集中系は何時間？」） | **重複しうる**   |

現行の tag 集計はすべて 1 軸しか持たないので、アクティビティ軸へ読み替えた上で、カテゴリー rollup を新規に足す。読み替え対象は §7-2 に列挙する。

### 6-2. カテゴリー rollup の残余バケット

カテゴリー軸で集計するとき、どのカテゴリーにも入らない時間が 2 種類ある（未分類アクティビティの時間 / アクティビティなしのブロックの時間）。**カテゴリー軸ではこれを 1 つの「未分類」バケットへ畳む** — ユーザーにとって「どのカテゴリーにも入っていない時間」は 1 つの概念なので、残余を 2 行に割ると読みにくくなる。アクティビティ軸では「アクティビティなし」を独立した行として出す。これで各軸の残余バケットが 1 つずつになり、§3 の不変条件が両軸で成り立つ。

現行 `estimation-accuracy.ts` の `aggregatePlanRecordEstimationAccuracy` と Time P/L の `buildTagPL` が既に「`tag_id` が null、または削除済みタグ参照を単一バケットへ畳む」という同じ畳み方をしているので、その形を踏襲する。

### 6-3. セグメントの表示規律（重要）

セグメントは重複しうるので、**分割として見せてはいけない**。

- 円グラフ・積み上げ棒・「合計 100%」の表現を使わない
- 出すのは単体の数字と、過去の自分との比較だけ（「今週の『深い仕事』は 12h。4 週平均より +2h」）。これは [strategy.md](../../strategy.md) §4-6「進捗は報酬ではなく証拠で見せる」の形そのもの
- 実装で機械的に守る: セグメント集計を返す関数の戻り値に `total` / `share` を含めない

### 6-4. 置き場所は右サイドパネルのまま

セグメントは「保存されたクエリ」なので、放置するとレポートビルダーへ育つ。[principles.md](../../product/principles.md) §右サイドパネル は「1 画面で終わる読み物以上にしない。カスタムレポート・期間指定の複雑なフィルタは足さない（Toggl/RescueTime の領土）」と明記している。この境界を守るため、セグメントに**保存させるのはアクティビティの集合だけ**とする。

- 期間はパネルが今見ている期間に従う（セグメント側に持たせない）
- 指標は固定（セグメント側で選ばせない）
- グルーピング・並べ替え・保存フィルタの入れ子を持たせない
- 専用ページを作らない。セグメントの CRUD も右パネル内で完結させる

この 4 点を守る限り、セグメントは「レポート」ではなく「よく使う問いのショートカット」に留まる。§12 に User 判断として再掲する。

## 7. 廃止対象の全数（実測）

`rg --hidden --glob '!.git/**'` と `find` による 2026-08-18 時点の実測値。

### 7-1. 削除するもの

| 領域                  | 対象                                                                                                                                                                                                                                                | 件数                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| feature ディレクトリ  | `apps/product/src/features/tags/`（components 22 / server 19 / hooks 11 / domain 4 / lib 2 / types 1 / barrel 1）                                                                                                                                   | **60 ファイル**     |
| サイドバー UI         | `apps/product/src/features/calendar/components/tag-filter/`                                                                                                                                                                                         | **25 ファイル**     |
| 作成 UI               | `apps/product/src/features/calendar/components/views/shared/components/InlineTagPalette/`                                                                                                                                                           | 5 ファイル          |
| store                 | `apps/product/src/features/calendar/stores/useTagDraftStore.ts`                                                                                                                                                                                     | 1 ファイル          |
| MCP tool              | `apps/product/src/app/api/mcp/_tools/tags-list.ts` と registry 登録                                                                                                                                                                                 | 1 ファイル          |
| timeblock 内 tag 実装 | `server/tag-assignment-guard.ts` / `tag-statistics.ts` / `statistics-tag-dashboard-service.ts` / `statistics-time-by-tag-transform.ts`、`domain/tag-dashboard.ts` / `tag-estimation-factor.ts` / `tag-stats.ts`、`hooks/useTagEstimationFactors.ts` | 8 ファイル          |
| review 内             | `components/time-pl/TimePLTagMarker.tsx`                                                                                                                                                                                                            | 1 ファイル          |
| test / factory        | `lib/test/integration/tags.integration.test.ts`、`lib/test/factories/tag.ts`、timeblock / tag-filter の tag 専用 test                                                                                                                               | 8 ファイル前後      |
| playground            | `app/[locale]/(app)/playground/dnd-tags/` と `app/[locale]/playground/dnd-multi-container/`（**両方消さないと `@dnd-kit` を落とせない**）                                                                                                           | 4 ファイル          |
| 依存                  | `@dnd-kit/core` / `@dnd-kit/sortable` / `@dnd-kit/utilities`                                                                                                                                                                                        | 3 package           |
| i18n                  | `apps/product/messages/{ja,en}/tags.json`                                                                                                                                                                                                           | **各 262 leaf key** |

**DB（drop migration を新規に書く対象）**

- テーブル `public.tags`、列 `plans.tag_id` / `records.tag_id`（FK 込み）
- RPC 7 本: `batch_rename_tags` / `batch_reorder_tags` / `batch_reorder_tags_hierarchy` / `increment_tag_sort_orders` / `merge_tags_with_hierarchy` / `rename_tag_group` / `assert_active_timeblock_tag_v1`
- **tags 専有のトリガー関数 4 本**: `check_tag_hierarchy()` / `check_tag_has_children()` / `enforce_plan_tag_owner()` / `enforce_record_tag_owner()`
- private 関数 1 本: `private.merge_tags_with_hierarchy_unserialized_v1`
- RLS ポリシー 4 本（テーブルごと消えるので個別 drop は不要）

> **トリガーと関数を数え分ける（drop migration の事故防止）**
>
> `tags` の上には他にも `trigger_serialize_direct_tag_delete` / `trigger_assert_tag_delete_writer_user` の 2 トリガーが乗っているが（`supabase/migrations/20260729073124_mcp_stage1_revision_fence.sql:507,522`）、**これらが実行している関数は tags 専有ではない**。実体は `private.guard_direct_timeblock_statement_v1()` と `private.assert_timeblock_writer_row_v1()` で、同じファイルの `plans` / `records` のトリガーからも共有されている。
>
> トリガー定義そのものは `DROP TABLE public.tags` で自動的に消えるので個別 drop は不要。**関数の方を drop 対象カタログへ入れると plans / records の revision fence が壊れる。** 同様に `update_updated_at()` も全テーブル共有なので触らない。
>
> だから drop 対象は migration の grep で作らず、**catalog（`pg_depend` / `pg_proc`）で完全シグネチャと依存を確認してから確定する**（time-model-split Step 9b と同じ手順）。実際、`20260729073124` のコメントは `trigger_lock_authenticated_tag_write` というトリガーに言及しているが、その名前の `CREATE TRIGGER` は migration 内に存在しない — grep ベースの棚卸しが当てにならない実例。

`tags` に触れる非 archive migration は 88 件あるが、**既存 migration ファイルは履歴として一切書き換えない**。消すのは新規の drop migration 1 本で行う。

**要確認**: `increment_tag_sort_orders` / `rename_tag_group` / `batch_rename_tags` / `batch_reorder_tags` の 4 本は現行 TS コードから呼び出し元が見つからなかった（前 2 者は `service_role` 限定 GRANT）。すでに孤児の可能性が高い。Step 1 の着手時に `get_advisors` かクエリログで確認し、孤児なら本 project の drop に同乗させる。

### 7-2. 改修するもの

| 領域           | 対象                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB command RPC | `create_plan_command_v1` / `update_plan_command_v1` / `create_record_command_v1` / `update_record_command_v1`（`p_tag_id` 引数）、`apply_mcp_{plan,record}_{create,update}_v1`、戻り値 row に `tag_id` を含む 9 本                                                                                                                                                                                                                                                                                                                                                               |
| private 関数   | `private.{create,update}_{plan,record}_unserialized_v1`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| timeblock 層   | `timeblock-command-client.ts` / `mcp-mutation-db.ts` / `mcp-mutation-client.ts` / `mcp-mutation-contract.ts`（`TAG_ARCHIVED` コード）/ `mcp-timeblock-read-client.ts` / `plan-service.ts` / `record-service.ts` / `plan-guards.ts` / `timeblock-search-query.ts` / `schemas/timeblock.ts`                                                                                                                                                                                                                                                                                        |
| calendar 層    | `useCalendarData.ts` / `TimeblockSearchDialog.tsx` / `CalendarAnalyticsPanel.tsx` / `CalendarGridContent.tsx` / `DraftTimeblock.tsx` / TwoLane 系 4 ファイル                                                                                                                                                                                                                                                                                                                                                                                                                     |
| timeblock UI   | `TimeblockInspector.tsx` / `TimeblockInspectorForm.tsx` / `TimeblockRelationshipSection.tsx` / `inspector/fields/TagRow.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| review 層      | `CalendarReviewPanel.tsx` / `ReviewDiffPanel.tsx` / `WeeklyReflectionPanel.tsx` / `time-pl/` 4 ファイル / `domain/timePL/{types,derivers}.ts` / `useTimePLData.ts` / `timePL.{presentation,mocks}.ts`                                                                                                                                                                                                                                                                                                                                                                            |
| 横断           | `lib/stores/useShellStore.ts`（`activeSheet` の tag 系 3 種と 6 メソッド）、`lib/database/tables.ts`、`app/api/trpc/_server/app-router.ts`、`ProvidersComposition.tsx`（Global*Modal 3 種）、`apps/product/eslint.config.mjs`（Layer 0 の `tags` 定義 1 ブロックと、barrel 強制の restricted-import 4 ブロック）、`apps/storybook/.storybook/mocks/stores.tsx`（`STORE_REGISTRY`）、`app/[locale]/(app)/_shell/SidebarContent.tsx`（Composition Layer。`CalendarFilterList` を合成している）、`features/calendar/index.ts`（`CalendarFilterList` / `TagChipRow` の export 2 行） |
| i18n           | `calendar.json`（46 行）/ `common.json`（9）/ `settings.json`（9）/ `timeblock.json`（6）/ `email.json`（4）/ `navigation.json`（1）/ `oauth.json`（1）                                                                                                                                                                                                                                                                                                                                                                                                                          |
| seed           | `supabase/seed.sql:104-109`（tags INSERT）と `122-225`（`v_tag_ids` 経由の plans/records 生成）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| E2E            | `lib/test/e2e/critical-path.spec.ts:183,189,211`（`getByRole('dialog', { name: 'タグを選択' })` 等のハードコード日本語）                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### 7-3. デザイントークン（見落としやすい別レイヤー）

`packages/foundations/src/tokens/colors.css` と `tailwind-theme.css` に 10 色パレットが **`--tag-*` / `--color-tag-*`** として定義され、`bg-tag-blue` のような Tailwind クラスとして `apps/product` と `apps/web`（マーケティングのモックアップ描画）の両方へ浸透している。

色の持ち主がカテゴリーになるので、**`--tag-*` → `--category-*` へ機械的にリネームする**（`.claude/rules/design-system.md` のトークン運用に従い、Storybook の `Colors.stories.tsx` / `Colors.mdx` も同時更新）。i18n の文言置換とは別レイヤーの作業なので、Step を分けずに cleanup Step へまとめる。

### 7-4. 公開契約（不可逆性のある層）

| 契約               | 現状                                                                   | 扱い                                                                                           |
| ------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| OAuth scope        | `read:tags`（`SUPPORTED_SCOPES` / `ADVERTISED_SCOPES` の両方に載る）   | **`read:activities` を追加し、`read:tags` は同義の deprecated alias として残す**（§12 で再掲） |
| MCP tool           | `tags.list`（`registry.ts` 登録、`SCOPE_MAP` で `read:tags` に紐づく） | `activities.list` / `categories.list` / `segments.list` へ置換                                 |
| MCP schemaVersion  | `MCP_TOOL_SCHEMA_VERSION = 2`（`_tools/tool-result.ts`）               | `tagId` → `activityId` は破壊的変更。**3 へ上げる**（1→2 の前例と同じ扱い）                    |
| GDPR export / 削除 | `auth/server/user-service.ts` のテーブル一覧に `tags`                  | 新 4 テーブルへ差し替え                                                                        |
| Inspector URL      | `timeblock=record:` 形式（tag は含まない）                             | 影響なし                                                                                       |

`read:tags` を即座に消さない理由: 第三者 MCP クライアント（Claude / ChatGPT / Cursor）が既に認可した grant を壊す。alias で受けておけば追加はいつでも取り消せる（[hours]）が、消してしまうと再認可を User に強いる。

### 7-5. 用語切替が通る機械ゲート（順序を間違えると赤くなる）

用語の全廃は 4 つの script が同時に見ている。それぞれ**何をすると落ちるか**を先に固定しておく。

**`pnpm copy:check`（`scripts/i18n/check-glossary.ts`）— 語の意味が反転する**

現行の禁止語リストは、いまの語彙を前提に組まれている。3 構造へ移すと**語の役割が入れ替わる**ので、単に「タグ」を足すだけでは済まない。

| 現行                                                | 本 project 後                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| `{ term: 'カテゴリ', preferred: 'タグ' }`（禁止語） | **削除する。**「カテゴリー」が正解語になるため                                  |
| `{ term: 'ラベル', preferred: 'タグ' }`（禁止語）   | 推奨語を「アクティビティ」へ差し替え。理由文も「1 ブロック 1 タグ」の表現を更新 |
| （「タグ」は正解語なので登録なし）                  | `{ term: 'タグ', preferred: 'アクティビティ / カテゴリー' }` を追加             |

- **部分一致の罠**: 検出は正規表現ではなく `value.includes(term)` の部分文字列一致。**`カテゴリ` は新用語 `カテゴリー` の部分文字列なので、消し忘れると新しい正解語が全件フラグされる。** これは Step 0 で必ず踏むので明記しておく
- **`ja` しか見ない**（`MESSAGES_DIRS` は `apps/product/messages/ja` と `apps/web/messages/ja`）。en 側の "Tag" は copy:check で検出できないので、Step 7 で別途 grep して潰す
- glossary 側（`docs/product/glossary.md`）は主要用語表 37 行目と禁止表記見出し（`### ラベル` 103 行目 / `### カテゴリ` 108 行目）が対象。script と glossary の同期は**機械検証されていない手動同期**なので、同じ commit で両方を直す

**`pnpm lint:i18n`（`scripts/check-i18n-integrity.ts`）— 3 チェックが順序を強制する**

`tags.json` を新 namespace へ移すとき、one-file-one-key / key-parity / pickMessages 配信 の 3 つが同時に成立する必要がある。ja と en を同時に、同じキー名で動かす。加えて **`apps/product/src/app/[locale]/(app)/layout.tsx:39` の namespace 配列に `'tags'` が載っている**ので、ここを直さないと `.claude/rules/architecture.md` §i18n namespace の削除 / リネーム が記録している 2026-04-22 の事故（`MISSING_MESSAGE` でグローバル component が crash し、リロードループになる）を踏む。`useTranslations('tags')` の呼び出しは 5 ファイル。

**`pnpm docs:coverage`（`scripts/docs-coverage/`）— spec の frontmatter が LP と公開 docs に紐づいている**

`docs/product/specs/tags.md` の frontmatter は `public_docs: [tags]` と `lp: ['Tags', 'Unlimited tags']` を宣言しており、script がこれを実ファイルと LP 文言に突き合わせている。spec を `activities.md` へ差し替えるときは、**公開 docs（`apps/web/content/docs/ja/organize/tags.mdx`、現在 ja のみ・`draft: true`）と LP 文言を同じ Step で動かす**。片方だけ直すと「LP の約束に対応する spec が無い」または「spec が宣言した LP 文言が LP に無い」で検出される。

**`pnpm quality:deadcode`（knip、`apps/product/knip.json`）**

Step 7 の削除後に走らせ、孤児化した barrel / ファイルを拾う。過去に空振りの barrel が unused file として 4 件検出された前例がある（`.claude/rules/feature-boundaries.md`）。

## 8. Step Count（ユーザー操作数）

`CLAUDE.md` シンプルルール 3「Google Calendar / Toggl より一手少なく」の検算。

| フロー                     | Google Calendar | Toggl | Dayopt 現在 | Dayopt（本 project 後） |
| -------------------------- | --------------- | ----- | ----------- | ----------------------- |
| 予定を 1 件置く            | 4 手            | —     | 2 手        | **2 手**（変わらず）    |
| 分類を 1 つ新規作成        | —               | 3 手  | 4 手        | **2 手**                |
| 分類を別の親へ付け替える   | —               | —     | 1 手（DnD） | **3 手**                |
| 1 カテゴリーだけ表示に絞る | —               | —     | 1 手        | **2 手**                |

- **予定を置く**: サイドバーのアクティビティをクリック → カレンダー上で確定。カテゴリー既定展開（§5-1）なので現行と同数
- **新規作成**: 現行は名前 + 色 + アイコン + 親の 4 項目。新モデルは見出しの `+` から作れば名前だけで済む（カテゴリーは押した見出しから決まる、色はカテゴリー継承）
- **付け替えが 1 手 → 3 手に増える**（context menu を開く → 「カテゴリーを変更」 → 選ぶ）。DnD 廃止が epic の確定仕様であり、付け替えは予定を置く操作と比べて頻度が桁違いに低い。日々の最短経路を守るために、稀な操作の手数を受け入れる
- **カテゴリー一括表示が 1 手 → 2 手に増える**。見出しのチェックボックス廃止が epic の確定仕様。見出しを静かに保つことでサイドバーの視覚ノイズが減る効果を取る

## 9. Step 分解と Reversibility Table

各 Step = 1 レーン = 1 branch = 1 PR（`.claude/rules/workflow.md` §PR 粒度・判定 3 問）。issue は指揮台が本設計の凍結後に起票する。

| #   | Step                                                                                                                                                                                    | Reversibility                     | 備考                                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | **用語と docs の確定** — glossary 改訂、禁止表記に「タグ」追加、`copy:check` 更新、`specs/activities.md` 新設、strategy / principles の語彙更新                                         | `[minutes]`                       | docs / script のみ。コード非依存で先行できる                                                                                                                                                                                                                                                                                                |
| 1   | **schema 新設** — `categories` / `activities` の 2 テーブル + RLS + GRANT + `assert_active_timeblock_activity_v1` + 生成型 + RLS snapshot                                               | `[hours]`                         | 純追加。`tags` に触れない。revert は drop migration 1 本。**`segments` / `segment_activities` はここで作らず Step 5 に置く**（下記）                                                                                                                                                                                                        |
| 2   | **server 層** — `features/activities/` の tRPC router / service / Zod / 単体 test                                                                                                       | `[minutes]`                       | UI 未接続。既存動線に影響なし                                                                                                                                                                                                                                                                                                               |
| 3   | **plans / records の `activity_id`** — 列追加 + 複合 FK + command RPC の**追加専用**シグネチャ変更                                                                                      | `[hours]`                         | `tag_id` と併存。UI 未接続。**additive-only 制約は必須**（下記）                                                                                                                                                                                                                                                                            |
| 4   | **cutover** — サイドバー IA / 作成・編集 / カレンダー表示を activity へ。DnD 撤去。filter store の version 上げ                                                                         | `[minutes]` / データは `[hours]`  | **ここで既存ブロックが全部「アクティビティなし」になる**（データ移行しない裁可の帰結）。コードの revert は commit 単位で効くが、**この窓の中で作られたブロックは `activity_id` を持ち `tag_id` を持たない**ため、revert すると分類が消えて見える（行は残る）。窓を短く保つ。**この `[minutes]` は Step 5 merge 前に限る**（下記の複利劣化） |
| 5   | **分析軸の切替 + セグメント** — Time P/L・見積もり精度・statistics をアクティビティ / カテゴリー軸へ。**`segments` / `segment_activities` の schema もここで作る** + セグメント UI 新設 | `[minutes]` / schema は `[hours]` | Step 4 merge から本 Step merge までの間、分析は新規ブロックを未分類として扱う（下記）                                                                                                                                                                                                                                                       |
| 6   | **公開契約** — MCP tool 置換 + schemaVersion 2→3、`read:activities` scope 追加、GDPR export、公開 docs 更新                                                                             | `[irreversible]`                  | schemaVersion の bump と MCP フィールド名は戻さない。`read:tags` は alias で残すので後退可                                                                                                                                                                                                                                                  |
| 7   | **非破壊 cleanup** — `features/tags` / tag-filter / i18n キー削除、`@dnd-kit` 撤去、`--tag-*` → `--category-*`、playground 削除                                                         | `[minutes]`                       | commit 単位で revert 可能                                                                                                                                                                                                                                                                                                                   |
| 8   | **destructive migration** — `tags` テーブル・`tag_id` 列・tag RPC / トリガー群 drop                                                                                                     | `[days]`                          | **`EXPLICIT AUTHORITY`**。明示指示 + 独立レビュー + backup / PITR 確認が揃うまで実行しない                                                                                                                                                                                                                                                  |

### Step 3 の RPC 変更は additive-only に固定する（本番故障を閉じる）

`docs/engineering/infra.md` の通り、**Supabase の migration 適用（GitHub integration）と Vercel の app デプロイは別パイプライン**で、同じ merge でも非同期に走る。migration が先に効いて旧 JS バンドルがまだ配信されている窓が必ずできる。

したがって Step 3 の command RPC 変更は**追加専用に固定する**:

- 新パラメータは `p_activity_id uuid DEFAULT NULL` の形で**足すだけ**。既存の `p_tag_id` を含む既存パラメータの名前・型・順序・既定値を変えない
- 戻り値の row shape も**列を足すだけ**。`tag_id` 列を消したり rename したりしない（消すのは Step 8）
- これを守れない設計（引数の置き換えが避けられない）になった場合、Step 3 は `[hours]` ではなく**本番故障の窓を持つ変更**として扱い、「migration 適用完了を確認してから app を deploy する」二段手順を実行手順に足す

この制約が無いと、旧バンドルを開いたまま予定を作成・編集したユーザーの RPC 呼び出しがその窓の間だけ失敗する。§2 が「deploy 間隙のリスクは純追加 → cutover → drop の順序だけで閉じる」と書いているのは Step 1 の話であって、**Step 3 には順序だけでは効かない**。

### Step 4 の可逆性は Step 5 merge 前までしか持たない

Reversibility Table は各 Step を独立に評価しているが、cutover の revert コストは**後続 Step が積まれるほど上がる**。Step 5（分析軸）や Step 6（公開契約）が production に乗った後は、それらが activity ベースのコードに依存しているため Step 4 だけの `git revert` は conflict する。

つまり `[minutes]` が有効なのは **Step 4 merge 後・Step 5 merge 前**の窓だけ。この窓の間に Sentry と主要動線（カレンダー表示・作成・編集・検索）の確認を済ませる。窓を過ぎたら、戻す単位は「Step 4〜6 をまとめて」になる。

### Step 4 と Step 5 の間の劣化を許容する理由

Step 4 と 5 を 1 PR に束ねると、tag-filter 25 ファイル + calendar + timeblock + review が同時に動く巨大な差分になり、クロスレビュー 1 巡で読み切れない（`workflow.md` §判定 3 問 の上限ガード）。分けると、その間だけ分析画面が新規ブロックを未分類として扱う。単一ユーザー・課金前・1 merge サイクルの窓なので、レビュー品質を優先して劣化を受け入れる。**Step 4 の PR 本文に、この劣化が発生することと解消 Step を明記する。**

### レーン編成へのマッピング（2026-08-18 の指揮台編成に対応）

指揮台は 2026-08-18 に「スライス単位の順次凍結」へ編成を変更し、レーン E / F / G を起こしている（epic #2162 のコメント）。本書の Step はそのレーンへ次のように載る。**Step 番号はレーンを跨がない**ように割ってある。

| レーン | branch                            | 本書の Step                                                              | 凍結が要る契約                                                                  |
| ------ | --------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **E**  | `claude/tag-model-schema-2162`    | Step 1（schema）+ Step 2（server）+ Step 3（`activity_id` と RPC）       | §4 全体、特に §4-1〜4-5 と §4-9、Step 3 の additive-only 制約                   |
| **F**  | `claude/tag-model-sidebar-2162`   | Step 4（cutover: サイドバー IA + 作成/編集 + カレンダー表示 + DnD 撤去） | §5 全体（IA・語彙・フィルタ state・store 事故経路）                             |
| **G**  | `claude/tag-model-analytics-2162` | Step 0（用語 / glossary / copy:check）+ Step 5（分析 + セグメント）      | §6 全体、§7-5 の機械ゲート、§4-3（segments schema）                             |
| 未割当 | —                                 | Step 6（公開契約）、Step 7（非破壊 cleanup）                             | §7-3 / §7-4                                                                     |
| 未割当 | —                                 | Step 8（destructive migration）                                          | `EXPLICIT AUTHORITY`。指揮台が User へ「物理削除は独立 Step、検証後」と伝達済み |

merge 順は指揮台の決定（#2159 → #2161 → E → F → G）に従う。本書 §9 の Step 順序はこれと矛盾しない — E が Step 1〜3、F が Step 4、G が Step 0 と Step 5 を持つ。

**Step 0 を G に置く理由**: 用語の全廃（glossary + `copy:check` + i18n キー）は G の「タグ文言全廃」と同じ作業で、分けると `copy:check` を 2 回赤くする。docs だけ先に出したい場合は E より前に単独で出してもよい（コード非依存）。

**Step 6 / 7 が未割当**であることは指揮台へ報告済みの論点。本日中の出荷方針では UI 上のタグ撤廃（E〜G）までが対象で、公開契約の切替と cleanup は翌日以降のレーンになる見込み。

### 走行中 PR との writer 境界

2026-08-18 時点で [PR #2161](https://github.com/Dayopt/dayopt/pull/2161)（calendar UI 束、#2148 / #2149）が走行中。実測した変更ファイルに `tag-filter/` / `features/tags/` / `shell/sidebar/` は**含まれない**が、本 project の Step 4 / 5 が触る次のファイルと重なる:

- `apps/product/src/features/calendar/index.ts`（barrel。`CalendarFilterList` と `TagChipRow` を export している 24-25 行目を Step 4 で消す）
- `apps/product/src/features/calendar/components/analytics/CalendarAnalyticsPanel.tsx`（Step 5）
- `apps/product/src/features/calendar/components/views/shared/components/CalendarGridContent.tsx`（Step 4）
- `apps/product/src/features/review/index.ts`（Step 5）

**Step 4 のレーンは #2161 の merge 後に起こす。** Step 0〜3 は重ならないので先行してよい（`.claude/rules/ai-behavior.md` §Writer ownership）。

### Step 8 の前提条件

`workflow.md` §分割してよい理由 の「code removal と destructive migration の混在回避」に従い、Step 7 と Step 8 を必ず別 PR にする。Step 8 の実行前に揃えるもの:

- Step 7 が production に反映され、`tags` を参照するコードが 1 行も動いていないことを実測（Sentry で `tags` 関連エラー 0 件、静穏期間）
- backup / PITR の存在確認
- drop 対象の完全シグネチャと依存を catalog（`pg_depend`）で確認してから drop する（time-model-split Step 9b と同じ手順）
- 生成型と RLS snapshot は migration 適用済みの local DB から再生成する（手編集しない）

## 10. Existing Code to Reuse

新規に書かず、流用するもの。

- **`TagIcon` の `isUncategorized` パターン**（`features/tags/components/TagIcon.tsx`）— 中立マーカー（`bg-muted` + `Minus`）の表現をそのまま `ActivityIcon` へ持ち込む
- **`tag-colors.ts` / `curated-icons.ts`** — 10 色パレットと 48 icon の定義。カテゴリー用にファイル名と token 名だけ変える
- **`useCalendarFilterStore`**（355 行、persist + カスタム Set serializer + migrate）— state 名を変えて再利用。migrate の書き方も既にある
- **`update_updated_at()` トリガー** — 4 テーブルの `updated_at` に流用
- **部分 unique index の形**（`tags_user_root_name_unique` 系、`20260424000000_restore_tag_parent_hierarchy.sql`）— `WHERE archived_at IS NULL` の書き方をそのまま使う
- **`assert_active_timeblock_tag_v1` の多層防御構造**（`20260805040809_assert_tag_not_archived.sql`）— ERRCODE → TS エラーコードのマッピングと、MCP が command 境界だけに委ねる理由を含めて移植
- **`buildTagPL` / `aggregatePlanRecordEstimationAccuracy` の残余バケット畳み込み** — §6-2 の実装形として既にある
- **tag mutation hooks の楽観的更新パターン**（`features/tags/hooks/useTagCrudMutations.ts` / `useTagArchiveMutations.ts` / `useTagMergeMutation.ts`）— Step 2 で新設する CRUD mutation は、この `onMutate` / `onSettled` の形をそのまま踏襲する（§5-4）。実装者ごとの判断に委ねない
- **`apps/storybook/.storybook/mocks/stores.tsx` の `STORE_REGISTRY`** — store 名を変える Step 4 で必ず追従させる（§5-5）。再利用ではなく「忘れると壊れる登録先」として明記する
- **`scripts/generate-rls-snapshot.ts`** — Step 1 / 8 の RLS snapshot 再生成
- **`docs/_templates/spec.md`** — `docs/product/specs/activities.md` の骨格

## 11. What I'm Not Doing

- **既存タグデータの移行をしない**（User 裁可 2026-08-18）。§12 に、移行が構造的には安価であるという反対証拠を添えて再掲する
- **`sort_order` と並べ替え UI を作らない**（§4-7）。名前順で始める
- **アクティビティごとの色・アイコンを持たせない**（§4-6）
- **マージ（統合）機能を v1 で作らない**（§4-8）。`is_active` 墓標状態ごと落とす
- **セグメントに期間・指標・グルーピングを保存させない**（§6-3、§6-4）。レポートビルダーを作らない
- **セグメント専用ページを作らない**（[strategy.md](../../strategy.md) §4-10）
- **`plans` / `records` にセグメント参照列を作らない**（§3）。セグメントが第 2 の分類軸に育つ道を構造で塞ぐ
- **`read:tags` scope を即座に削除しない**（§7-4）。alias で受ける
- **既存 migration ファイルを書き換えない**。drop は新規 migration 1 本で行う
- **1 PR に code removal と destructive migration を混ぜない**（Step 7 / 8 の分離）
- **Free/Pro の enforcement をこの project で実装しない**（§12-1）。境界の決定が先
- **ついでのリファクタをしない** — `useShellStore` の `activeSheet` は tag 系 3 種を差し替えるだけにし、sheet 機構そのものは触らない

## 12. 未決事項（本設計では決めない）

指揮台経由で User の価値判断を仰ぐ。いずれも推奨を添えるが、決定は User に残す。**各項目に「推奨が却下された場合に §4 / §9 のどこが変わるか」を併記する** — 未決のまま schema 実装が先行して手戻り範囲が読めなくなるのを防ぐため。

### 12-1. Free/Pro 境界の読み替え（epic で「保留」と明示された論点）

現状 `packages/billing/src/entitlement.ts` は `pro_access` の単一バイナリしか持たず、per-feature gating が存在しない。`settings.json` は Free を「タグ 5 個まで」と謳うが、`tag-mutation-service.ts` に件数チェックは無い（[#2134](https://github.com/Dayopt/dayopt/issues/2134)）。「タグ 5 個まで」を 3 構造でどう読むかの選択肢:

| 案  | 読み替え                                                                       | 評価                                                                                                                                |
| --- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| α   | アクティビティ数の上限（Free 5）                                               | epic の確定仕様「無限に増えてよい。作成コストは激安のまま」と正面から矛盾する。**採れない**                                         |
| β   | カテゴリー数の上限（Free 3 など）                                              | 新モデルと矛盾しない。ただしカテゴリーは体感 5〜10 個で足りるので、上限が痛みにならず gating が弱い                                 |
| γ   | セグメント数の上限（Free 0 または 1）                                          | 分析軸の gating。[#1336](https://github.com/Dayopt/dayopt/issues/1336) の「API/MCP は Pro」「履歴の深さ」と同じ"深く使う人が払う"筋 |
| δ   | 数量制限を撤廃し、境界を別軸（履歴の深さ / API・MCP / 外部カレンダー）へ寄せる | #1336 の capability map 案そのもの。LP と料金ページの書き換えが要る                                                                 |

**推奨: γ + δ の組み合わせ。** α は確定仕様と衝突し、β は gating として効かない。あわせて LP の "Unlimited tags"（`docs/product/specs/tags.md` frontmatter の `lp:`）と `settings.json:667,675` の書き換えが必要になる。ただし **#1336 の capability map が未確定のまま個別に決めると三度手間になる**ので、本 project では「タグ数上限という文言を消す」ところまでに留め、境界の確定は #1336 に委ねるのが最小手数。

### 12-2. 既存タグデータを本当に捨てるか（反対証拠つき）

User は「無視でいい。全とっかえする」と裁可済み。本設計はその前提で書いている。ただし**その裁可の前提になっていない事実**が調査で 1 つ出たので、判断材料として上げる。

現行 tags は既に「最大 2 階層・1 ブロック 1 タグ」で、新モデルと**構造的に同型**である（親タグ → カテゴリー、子タグと root タグ → アクティビティ、`plans/records.tag_id` → `activity_id`）。したがって移行は migration 1 本の INSERT ... SELECT で書ける見込みで、「移行が高くつくから捨てる」という前提は成り立たない。捨てる場合に失われるのは、既存の全 Plan / Record の分類（cutover 直後に全ブロックが「アクティビティなし」になる）。

**却下された場合（= 移行する）の影響**: Step 3 に backfill migration（親タグ → カテゴリー、子/root タグ → アクティビティ、`tag_id` → `activity_id` の `INSERT ... SELECT`）が 1 本増え、Step 8 の drop 前に件数突合が要る（[hours]）。§4 の schema と Step 4〜7 は変わらない。

**推奨: User の裁可どおり移行しない。** 捨てる方の利点（レガシーな命名を引きずらない、Step 数が減る、destructive migration の突合が不要になる）が、単一ユーザー・課金前という現状では上回ると見る。ただし「移行が高いから」ではなく「作り直したいから」という理由で選ばれているかを一度だけ確認したい。移行を選ぶ場合は Step 3 に backfill migration が 1 本増えるだけで、他の Step 構成は変わらない（[hours]）。

### 12-3. `read:tags` scope の扱い

**推奨: alias で残す（§7-4）。** ただし外部 MCP クライアントへの grant が実際に 0 件であることを確認できれば、alias を作らず `read:activities` へ置き換える方が単純で、後で deprecated を掃除する仕事も消える。grant 件数の実測が判断材料になる。

### 12-4. マージ（統合）機能を落とすこと

**却下された場合（= マージを残す）の影響**: `activities` に墓標状態の列（現行 `is_active` 相当）が復活し、§4-8 の「状態は通常 / アーカイブの 2 つだけ」が 3 状態に戻る。Step 1 の schema と Step 2 の service に merge 経路が加わる（[hours]）。

**推奨: v1 で落とす（§4-8）。** 現行の merge は RPC 1 本・モーダル 3 ファイル・墓標状態（`is_active`）を抱えており、これを落とすと状態モデルが「通常 / アーカイブ」の 2 つだけに単純化する。ただし現に動いている機能の削除なので、User の判断を仰ぐ。落とした場合、重複して作ったアクティビティの履歴は統合できない（改名 + アーカイブで運用する）。

### 12-5. `strategy.md` の語彙更新（憲法に触れる）

[strategy.md](../../strategy.md) は §4-1「Dayopt が所有するのは時間とタグだけ」、§4-2「ブロックは抽象でいい。**タグが語彙。**」と、タグを語彙として明文化している。3 構造への置換はこの記述を書き換えることを意味する。

- §4-1 / §4-2 の「タグ」を新語彙へ更新するのは Step 0 に含める（実質的な方針転換ではなく、同じ思想の語彙更新）
- ただし **§4-2 の「3 階層以上や自由なメタデータは分類管理という新しい摩擦を生むので許さない」は本設計でも守られている**（深さは 2 のまま、メタデータは増えない）ことを確認した上で書き換える
- **セグメントを作ること自体は epic #2162 の確定事項**であり、ここで問い直す論点ではない。開いているのは §4-10「レビュー専用ページ・独立した分析画面を作らない」との緊張をどう閉じるかで、本設計は §6-3 / §6-4 の 4 制約（期間・指標を保存しない / 専用ページを作らない / 合計と円グラフを出さない / カテゴリーをメンバーにしない）で閉じる案を出している。**この 4 制約で足りるかが User の価値判断**
- あわせて、セグメントは `plans` / `records` から参照されない独立した構造なので、実使用で使われなければ丸ごと削除できる（`CLAUDE.md` シンプルルール 5 の削除候補に素直に乗る）。だから schema も Step 1 ではなく、実際に使う Step 5 で作る

`.claude/rules/decision-principles.md` の適用場面「ルール自体の改訂」に当たるため、シンプルルールではなく 5 原則で評価した: 原則 1（破滅）に該当なし、原則 3（撤退条件）— セグメントが実使用で使われなければ削除候補にする（`CLAUDE.md` シンプルルール 5）、原則 4（扉）— セグメントを `plans/records` から参照させない設計により、後から捨てても他が壊れない。

## 13. 検証

- Step ごとに `pnpm check` / `pnpm typecheck` / `pnpm lint` / `pnpm lint:boundaries` / `pnpm lint:i18n` / `pnpm copy:check`
- §3 の 2 つの不変条件を単体テストで凍結する（カテゴリー rollup とアクティビティ集計の合計一致）
- セグメント集計の戻り値に `total` / `share` が含まれないことをテストで固定する（§6-3）
- filter store の persist migrate が旧 version の state を安全に捨てることをテストで固定する（§5-3）
- RLS: 他ユーザーの category / activity を指す行が書けないことを integration test で確認する（複合 FK の実効性、§4-4）
- Step 4 / 5 は Storybook と共有 browser surface で視覚確認する（`workflow.md` §Storybook 視覚確認）

## 14. 関連

- [epic #2162](https://github.com/Dayopt/dayopt/issues/2162) — 確定仕様と進捗の正本
- [#2134](https://github.com/Dayopt/dayopt/issues/2134) — Free/Pro が 3 箇所で未 enforcement
- [#1336](https://github.com/Dayopt/dayopt/issues/1336) — Free/Pro 境界の source of truth
- [docs/product/specs/tags.md](../../product/specs/tags.md) — 現行タグ仕様（本 project 完了時に `activities.md` へ置換）
- [time-model-split](../_archive/time-model-split/overview.md) — 同型の全置換 project。特に [step-9-cleanup](../_archive/time-model-split/step-9-cleanup.md) の非破壊 cleanup → destructive migration の順序
- [2026-08-03 タグアーカイブ設計](../../product/log/2026-08-03-tag-archive-design.md) — アーカイブ状態モデルの経緯
