---
status: active
last_verified: 2026-08-18
code:
  - apps/product/src/features/tags
  - apps/product/src/features/calendar/components/activity-filter
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

| カラム                 | 型               | 制約                                                                                        |
| ---------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| id                     | uuid PK          | `gen_random_uuid()`                                                                         |
| user_id                | uuid NOT NULL    | FK → `auth.users`、ON DELETE CASCADE                                                        |
| name                   | text NOT NULL    |                                                                                             |
| color                  | text NULL        | 10 色パレットの色名。非 NULL 値には CHECK で値域を固定。**NULL は既定色へのフォールバック** |
| icon                   | text NULL        | curated icons の Lucide 名                                                                  |
| archived_at            | timestamptz NULL |                                                                                             |
| created_at, updated_at | timestamptz      | `update_updated_at()` トリガーを流用                                                        |

- `UNIQUE (id, user_id)` — 複合 FK の受け皿。実データ上は冗長だが、これが無いと 4-4 の所有者整合が書けない
- `UNIQUE (user_id, name) WHERE archived_at IS NULL` — 通常カテゴリー名の一意。既存 `tags_user_root_name_unique` と同じ部分 unique index の形
- **`parent_id` を持たない。** 階層は構造的に発生しないので、現行の `check_tag_hierarchy()` / `check_tag_has_children()` の 2 トリガーが不要になる。深さ制約をトリガーで守る必要がなくなるのが、2 階層固定を「列を作らない」ことで表現する利点
- **`color` は nullable**（2026-08-18 確定）。当初契約は NOT NULL + 10 色 CHECK だったが、実装レビュー（P1/P2 ゼロで merge 済み）を経て nullable を採用した。消費側（分析の集計行、サイドバーの継承解決）がいずれも NULL を既定色フォールバックとして扱う実装で揃っており、後から NOT NULL 化するには新 migration と既定色 backfill の判断が要る一方で得るものが無い。**非 NULL 値への 10 色 CHECK は維持する**（値域の保証は失っていない）

### 4-2. activities

| カラム                 | 型               | 制約                                    |
| ---------------------- | ---------------- | --------------------------------------- |
| id                     | uuid PK          |                                         |
| user_id                | uuid NOT NULL    | FK → `auth.users`、ON DELETE CASCADE    |
| category_id            | uuid NULL        | **NULL = 未分類。これが単一所属の表現** |
| name                   | text NOT NULL    |                                         |
| archived_at            | timestamptz NULL |                                         |
| created_at, updated_at | timestamptz      |                                         |

- `UNIQUE (id, user_id)`
- 名前の一意性は **2 本の部分 index に分ける**（レーン E 推奨を採用、2026-08-18 確定）:
  - `UNIQUE (user_id, category_id, name) WHERE category_id IS NOT NULL AND archived_at IS NULL`
  - `UNIQUE (user_id, name) WHERE category_id IS NULL AND archived_at IS NULL`
  - 1 本目だけだと `category_id IS NULL`（未分類）の行が UNIQUE の対象外になり、未分類セクションに同名が 2 行並んで区別できなくなる。既存 `tags_user_parent_name_unique` が同じ穴を持っていた
  - カテゴリーをまたいだ同名（`仕事 / レビュー` と `学習 / レビュー`）は**許す**。サイドバーではネストで、カレンダーではカテゴリー色で区別できる
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

**実測で確認済み**（2026-08-18、レーン H が local PG 17.6 でトランザクション内検証、`ROLLBACK` 済み）— 5 点すべて期待どおり:

| 検証                                                               | 結果                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------ |
| 他ユーザーの activity を参照する plan の INSERT                    | FK 違反で拒否（**トリガー無しで所有者整合が効く**）    |
| 同一ユーザーなら INSERT 可能                                       | 成功                                                   |
| activity 削除 → `plans.activity_id` だけ NULL 化、`user_id` は生存 | 列指定 `ON DELETE SET NULL (activity_id)` が正しく効く |
| category 削除 → `activities.category_id` だけ NULL 化              | 同上                                                   |
| 後から `user_id` を他人へ書き換え                                  | FK 違反で拒否（**所有者の事後改竄も塞がる**）          |

最後の 1 行はトリガー案に対する優位点で、`enforce_plan_tag_owner()` は INSERT / UPDATE 時の検証なので同じ保証を得るには条件を足す必要がある。**したがって「`enforce_plan_tag_owner()` を写して所有者一致トリガーを 1 本置く」案は採らず、複合 FK 0 トリガーで確定する。** 既存 repo にも先例がある（`calendar_connections_id_user_id_unique`、`20260723233814`）。

**一次資料**: PostgreSQL 17 公式ドキュメント [Constraints > Foreign Keys](https://www.postgresql.org/docs/17/ddl-constraints.html) が、まさにこの形（テナント境界を複合 FK で守り、`ON DELETE SET NULL (author_id)` で必須列を NULL にしないようにする）を正規解として例示している。列リスト付き referential action は PG 15 以降の構文で、本環境は PG 17（`supabase/config.toml` の `major_version = 17`）なので使える。

### 4-5. RLS / GRANT

4 テーブルとも `tags` と同じ 4 ポリシー構成にする（`docs/engineering/data/db/rls-snapshot.md` の tags 節と同型）。

| 操作   | USING                           | WITH CHECK                      |
| ------ | ------------------------------- | ------------------------------- |
| SELECT | `(select auth.uid()) = user_id` | —                               |
| INSERT | —                               | `(select auth.uid()) = user_id` |
| UPDATE | `(select auth.uid()) = user_id` | `(select auth.uid()) = user_id` |
| DELETE | `(select auth.uid()) = user_id` | —                               |

- UPDATE に **最初から WITH CHECK を付ける**。tags では USING だけで作られ、2026-04-30 の `20260430000000_fix_tags_user_settings_update_with_check.sql` で後追い修正された不備がある。同じ穴を再現しない
- **GRANT はパターン A**（レーン E 実測 + 推奨、指揮台同意、2026-08-18 確定）。この repo には 2 系統ある — パターン A（`tags` / `user_settings`: `authenticated` に table-level DML を渡し防御を RLS に載せる）と パターン B（`plans` / `records`: `authenticated` は SELECT のみ、書き込みは SECURITY DEFINER のコマンド RPC）。新 3 テーブルは tags の置換で書き込み経路も tRPC → PostgREST 直で同型なのでパターン A を採る
- ただし **`anon` には一切与えない**。`tags` の `anon` DML は歴史的経緯で残っているだけ（`20260810085344_revoke_excess_table_grants.sql` が Tier 2 と分類して TRUNCATE だけ剥がした）で、新規に再現する理由が無い
- **production だけテーブルが開く罠に invariant ブロックで蓋をする（必須）**。`.claude/skills/supabase/SKILL.md` に既知として明記のとおり、production の `pg_default_acl` は新規 public テーブルへ `anon` / `authenticated` にほぼ全権限を既定付与するが local / Preview は違う。`pnpm rls:snapshot` は local しか見ないので **snapshot でも CI でも検出できない**。唯一のゲートは migration 自身に `has_table_privilege` の invariant を埋め込むこと
- **先例をそのまま写さない**: `20260723233814_add_calendar_connection_tables.sql` §6 の `has_table_privilege(..., 'SELECT, INSERT, UPDATE, DELETE')` は**カンマ区切りが OR 判定**になるため 4 種そろっている証明にならない（`20260810085344` が実測で指摘済み）。**1 privilege ずつ個別に呼んで AND で結合する形**を使う
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

**マージ（統合）は v1 で持たない**（User 裁可 2026-08-18 確定）。現行は `merge_tags_with_hierarchy` RPC + 墓標状態（`is_active = false`）+ 専用モーダル 3 ファイルという相応の実装を抱えているが、全とっかえでデータが引き継がれない以上、「重複タグを作ってしまった過去」も引き継がれない。改名 + アーカイブで代替し、実使用で需要が出たら別 epic にする。この判断により `is_active` 列と墓標状態そのものが不要になる（状態は「通常 / アーカイブ」の 2 つだけ）。

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
- **未分類配下のアクティビティは icon なし・テキストのみ**（2026-08-18 User 指示）。継承する色が無い以上、中立マーカーを並べても情報を足さずノイズになる。カテゴリー配下のアクティビティは従来どおりカテゴリーの色つきアイコンを継承する
- アクティビティのクリック = 予定を置く導線（現行の `useTagDraftStore` → カレンダー上の draft → 確定、を踏襲）

### 5-2. 「未分類」と「アクティビティなし」を混同しない

epic は「未所属のアクティビティは『未分類』として扱う」と確定させた。一方で現行 UI には**別の残余概念**がある — タグが付いていないブロック（現行の「タグなし」/ Review の「未分類」）。新モデルではこの 2 つが同時に画面へ出るので、語を分ける。

| 概念                                           | ja                     | en            | 出る場所                                                  |
| ---------------------------------------------- | ---------------------- | ------------- | --------------------------------------------------------- |
| カテゴリーに所属しないアクティビティ           | **未分類**             | Uncategorized | サイドバー見出し、カテゴリー別集計                        |
| アクティビティが設定されていない Plan / Record | **アクティビティなし** | No activity   | カレンダーのカード、Inspector、検索、アクティビティ別集計 |

現行が「タグなし」（カレンダー）と「未分類」（Review 集計行）で同じものを 2 通りに呼んでいる不統一も、ここで解消する。

**サイドバーに「アクティビティなし」のフィルタ行は置かない**（2026-08-18 User 指示）。アクティビティ未設定のブロックは常に表示する。語としての「アクティビティなし」はカレンダーのカード・Inspector・アクティビティ別集計には残る（表 のとおり）が、サイドバーで表示を切り替える導線だけを廃止する。

### 5-3. フィルタ

`useCalendarFilterStore`（現行 355 行、persist version 7）は state の意味だけを差し替えて残す — フィルタ機構そのものは新モデルでも要る。

- `visibleTagIds` → `visibleActivityIds`
- **`showUntagged` に相当する state は持たない**（2026-08-18 User 指示、§5-2）。サイドバーに切替 UI が無い以上、state だけ残すと「UI から戻せないのに非表示のまま」という復帰不能な状態を作れてしまう。未設定ブロックは常に表示する
- **persist の version を上げ、旧 state を捨てる migrate を書く**。タグ ID の集合を activity ID として読むと、全部が未知 ID になって「何も表示されない」状態でアプリが開く。空集合へ落とす（実装は version 9。version 8 は state 名だけを改名した世代で、中身はまだタグ ID だった）
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

現行 `features/timeblock/domain/estimation-accuracy.ts` の `aggregatePlanRecordEstimationAccuracy` と `buildTagPL` が既に「`tag_id` が null、または削除済みタグ参照を単一バケットへ畳む」という同じ畳み方をしているので、その形を踏襲する。

**集計ロジックの所在に注意（レーン境界に効く）**: Time P/L の画面は `features/review`（Layer 2）にあるが、**集計の本体は `features/timeblock`（Layer 1）側にある** — `domain/estimation-accuracy.ts`、`server/statistics-row-builders.ts` / `statistics-summary-service.ts` / `statistics-service.ts` / `statistics-kpi-service.ts`。分析軸を切り替える作業は review だけでは閉じず、timeblock の server / domain を触る。

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

| 契約                    | 現状                                                                                    | 扱い                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| OAuth scope             | `read:tags`（`SUPPORTED_SCOPES` / `ADVERTISED_SCOPES` の両方に載る）                    | **`read:activities` を追加し、`read:tags` は同義の deprecated alias として残す**（§12 で再掲）                        |
| MCP tool                | `tags.list`（`registry.ts` 登録、`SCOPE_MAP` で `read:tags` に紐づく）                  | `activities.list` / `categories.list` / `segments.list` へ置換                                                        |
| MCP schemaVersion       | `MCP_TOOL_SCHEMA_VERSION = 2`（`_tools/tool-result.ts`）                                | `tagId` → `activityId` は破壊的変更。**3 へ上げる**（1→2 の前例と同じ扱い）                                           |
| GDPR export / 削除      | `auth/server/user-service.ts` のテーブル一覧に `tags`                                   | 新 4 テーブルへ差し替え                                                                                               |
| MCP 冪等 digest         | `apply_mcp_*` 4 本が `jsonb_build_object(..., 'tagId', p_tag_id, ...)` で digest を作る | **`'tagId'` のまま据え置く。改名しない**（下記）                                                                      |
| MCP mutation error code | `TAG_ARCHIVED`（`mcp-mutation-contract.ts`。DB の `ERRCODE DT014` からマップ）          | **破壊的変更**。クライアントが `error.code` で分岐しうる。alias は持たせず schemaVersion 2→3 と同じ Step で一度に切る |
| Inspector URL           | `timeblock=record:` 形式（tag は含まない）                                              | 影響なし                                                                                                              |

`read:tags` を即座に消さない理由は、当初想定していたより**はるかに強い**（2026-08-18、レーン H の実測）。壊れ方は「tags だけ見えなくなる」ではなく **「その接続の MCP 呼び出しが全部 401 になる」**:

1. `lib/oauth-server/scopes.ts` の `SUPPORTED_SCOPES` から消えると `isSupportedScope('read:tags')` が `false`
2. `lib/mcp/auth.ts` の `parseStoredScopes` は **`scopes.every(isSupportedScope)` で配列全体を見て、1 つでも未知なら `null` を返す**（該当 scope だけ落とすのではない）
3. `null` → `OAuthServerError('invalid_token', 401)`。`_protocol-handler.ts` にも同型の all-or-nothing gate がもう 1 枚

つまり `read:tags` を持つトークンは、**tags と無関係な `constraints.get` すら呼べなくなる**。

**もう 1 つの不変条件**（`auth.ts`）: `if (parsed.some(isWriteScope) && !parsed.includes('read:entries')) return null;` — **write 系 scope は `read:entries` の同伴が必須**。`write:activities` のような新 scope を足すときはこの規則を壊さない形にする。

DB 側の CHECK 制約にも scope 配列が **4 箇所**ハードコードされている（`20260729062428` の 3 箇所 + `20260729073125`）。

なお本 repo の破壊的改名の既存パターンは in-place 置換ではなく **additive**（`entries.list` が `plans.list` / `records.list` と並存している）で、alias 方針はこの前例と一致する。

**冪等 digest のキー名は変えない**（レーン H 推奨を採用）: `'tagId'` を `'activityId'` へ変えると **deploy 前に発行された receipt と digest が一致しなくなり、同じ `operation_id` で再送したクライアントが `DM006 IDEMPOTENCY_KEY_REUSED` を踏む**。digest は外部に露出しない内部表現で、クライアントが観測するのは receipt の `resource_id` / `version` だけなので、キー名を「正しく」する価値より in-flight な冪等キーを壊さない価値が大きい。直すなら既存 receipt が全部期限切れになった後（Step 8 のタイミング）。

`MCP_MUTATION_RECEIPT_SCHEMA_VERSION`（現在 `1`）は DB に永続化される **`MCP_TOOL_SCHEMA_VERSION` とは別のカウンタ**。混同すると冪等 replay が壊れる。bump するのは read tool の envelope を versioning している後者だけで、`tagId` を保持する tool は **17 中 12 本**、出力 schema は全部 `.strict()`。

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

> **本日の到達範囲は「完全切替」で確定**（User 裁可 2026-08-18）。見える層（3 テーブル + サイドバー + 分析 + 文言全廃）に加え、**予定・記録のアクティビティ参照切替（コマンド RPC 13 本 + MCP 公開契約）まで本日中**に出す。tags の物理削除だけが独立 Step。

**merge 順は指揮台が確定**（2026-08-18、[#2162 コメント](https://github.com/Dayopt/dayopt/issues/2162)で更新済み）: `F → E1 → H1 → F2（データ切替の小 round、レーン F）→ H2 → G`。F（#2179）を先頭に置くのは、open PR が #2179 のみで E1/H1 が未 PR 化のため先行追従の無効化が発生せず、#2179 の中身（UI shell / 語彙 / DnD 撤去）が E1/H1 に依存しないため。activities への実データ切替は従来どおり H1 merge 後（F2）に行う。

| #   | Step                                                                                                                                                                                                       | レーン                          | Reversibility                     | 備考                                                                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | **用語と docs の確定** — glossary 改訂、禁止表記に「タグ」追加、`copy:check` 更新、`specs/activities.md` 新設、`strategy.md` §4-1 / §4-2 の語彙更新                                                        | G                               | `[minutes]`                       | docs / script のみ。コード非依存で先行できる                                                                                                                                                                                                                                           |
| 1   | **schema 新設** — `categories` / `activities` + RLS + GRANT（パターン A・`anon` なし）+ privilege invariant + `assert_active_timeblock_activity_v1` + 生成型 + RLS snapshot                                | E1                              | `[hours]`                         | 純追加。`tags` に触れない。`segments` はここで作らない                                                                                                                                                                                                                                 |
| 2   | **server 層 + GDPR** — `features/activities/` の tRPC router / service / Zod / 単体 test。**`auth/server/user-service.ts` の export / deleteAllData への新テーブル追加を同梱**（指揮台の writer 境界確定） | E1                              | `[minutes]`                       | テーブル追加と同時でないとエクスポート漏れ・削除漏れの穴が開く                                                                                                                                                                                                                         |
| 3   | **plans / records の参照切替** — `activity_id` 列 + 複合 FK + コマンド RPC **13 本**の DROP→CREATE→GRANT 再適用（additive-only の意図は維持）+ `record_plan_command_v1` のコピー経路                       | H1                              | `[hours]`                         | `tag_id` と併存。UI 未接続。**characterization test を先に書く**（下記）                                                                                                                                                                                                               |
| 4   | **cutover** — サイドバー IA / 作成・編集 / カレンダー表示を activity へ。DnD 撤去 + playground 2 ディレクトリ削除 + `@dnd-kit` 3 依存撤去。filter store の version 上げ                                    | F                               | `[minutes]` / データは `[hours]`  | **ここで既存ブロックが全部「アクティビティなし」になる**（データ移行しない確定の帰結）。コードの revert は commit 単位で効くが、窓の中で作られたブロックは `activity_id` を持ち `tag_id` を持たないため revert すると分類が消えて見える。**この `[minutes]` は Step 5 merge 前に限る** |
| 5   | **分析軸の切替 + セグメント** — Time P/L・見積もり精度・statistics をアクティビティ / カテゴリー軸へ。**`segments` / `segment_activities` の schema もここ** + セグメント UI                               | G                               | `[minutes]` / schema は `[hours]` | Step 4 merge から本 Step merge までの間、分析は新規ブロックを未分類として扱う                                                                                                                                                                                                          |
| 6   | **公開契約** — MCP tool 置換 + schemaVersion 2→3、`read:activities` 追加（`read:tags` は alias 維持）、公開 docs 更新                                                                                      | H2                              | `[irreversible]`                  | schemaVersion の bump と MCP フィールド名は戻さない。**冪等 digest のキーは触らない**                                                                                                                                                                                                  |
| 7   | **非破壊 cleanup** — `features/tags` / tag-filter / i18n キー削除、`--tag-*` → `--category-*` トークン                                                                                                     | **本日 scope 外**（指揮台采配） | `[minutes]`                       | 明日以降の編成。commit 単位で revert 可能                                                                                                                                                                                                                                              |
| 8   | **destructive migration** — `tags` テーブル・`tag_id` 列・tag 専有 RPC / トリガー群 drop                                                                                                                   | 未割当                          | `[days]`                          | **`EXPLICIT AUTHORITY`**。明示指示 + 独立レビュー + backup / PITR 確認が揃うまで実行しない                                                                                                                                                                                             |

### Step 3 の RPC 変更は additive-only に固定する（本番故障を閉じる）

`docs/engineering/infra.md` の通り、**Supabase の migration 適用（GitHub integration）と Vercel の app デプロイは別パイプライン**で、同じ merge でも非同期に走る。migration が先に効いて旧 JS バンドルがまだ配信されている窓が必ずできる。

したがって Step 3 の command RPC 変更は**追加専用に固定する**。ただし **`CREATE OR REPLACE` で足してはいけない**（2026-08-18、レーン H が local PG 17.6 で実測。トランザクション内 `ROLLBACK` 済み）:

| 手順                                           | 実測結果                                                 |
| ---------------------------------------------- | -------------------------------------------------------- |
| `CREATE OR REPLACE` で引数を 1 本足す          | **REPLACE されず overload になる**（2 シグネチャが並存） |
| その状態で旧バンドル相当の named-arg 呼び出し  | **`ERROR: function ... is not unique`** で失敗           |
| 引数名だけ変更（`p_tag_id` → `p_activity_id`） | **`ERROR: cannot change name of input parameter`**       |

つまり素朴な「足すだけ」は、**防ごうとした deploy 間隙の故障を対策そのものが引き起こす**。正しい手段は次:

- **同一 migration 内で「旧シグネチャを厳密指定して `DROP` → 新シグネチャで `CREATE`」**にする。関数が 1 本に保たれ、旧バンドル（DEFAULT で埋まる）も新バンドルも通る（実測確認済み）
- **`DROP` すると ACL が失われる。** 本 repo は `20260604230607_harden_function_execute_privileges.sql` で関数の EXECUTE を一斉 REVOKE + allowlist 化しているため、**同じ migration 内で GRANT / REVOKE を再適用しないと、その関数だけ hardening 前（PUBLIC に EXECUTE）へ静かに戻る**
- additive-only の**意図**は変わらない: 新パラメータは `p_activity_id uuid DEFAULT NULL` として末尾に足し、既存パラメータの名前・型・順序・既定値を変えない
- 戻り値の row shape も**列を足すだけ**。`tag_id` 列を消したり rename したりしない（消すのは Step 8）。`create_plan_command_v1` 系は `RETURNS SETOF public.plans` なので、`plans` に列を足せば `DROP FUNCTION` 無しで戻り値に反映される
- **`private.{create,update}_{plan,record}_unserialized_v1` も同じ制約の対象**。公開 RPC だけ additive にしても、内部関数のシグネチャを置き換えれば同じ窓で壊れる

**表面積は 13 本**（当初「8 本」と見積もっていたが実測で訂正、レーン H）:

| 層                                                   | 本数 | 備考                                                              |
| ---------------------------------------------------- | ---- | ----------------------------------------------------------------- |
| public wrapper（`SECURITY DEFINER`）                 | 4    | service_role guard + advisory lock → private を**位置引数**で呼ぶ |
| private 実体（`SECURITY INVOKER`、EXECUTE 剥奪済み） | 4    | `assert_*` の PERFORM と実 INSERT / UPDATE                        |
| `apply_mcp_*_v1`                                     | 4    | 認可 → digest → replay → base コマンドを**位置引数**で呼ぶ        |
| `assert_active_timeblock_tag_v1`                     | 1    | 新設に置き換える（§4-9）                                          |

**内部呼び出しがすべて位置引数**なので、引数を足した瞬間に位置がずれて呼び出し側も直す必要がある。「1 本足すだけ」では済まない。

**scope に必ず含める**: `record_plan_command_v1` は `plans.tag_id` → `records.tag_id` を**コピー**している（`20260729062435`）。漏らすと Plan → Record 変換で分類が落ちる。

**保存すべき挙動**: `update_{plan,record}_command_v1` は **tag が変わらない時は検証をスキップ**する（`IF p_tag_id IS DISTINCT FROM v_plan.tag_id THEN PERFORM assert_...`）。アーカイブ済みの分類が付いた過去のブロックを編集不能にしないための意図的な挙動なので、activity 版でも同じ条件分岐を維持する（§4-9 の「既存の `tag_id` を変更しない編集は許可する」と同じ規律）。

- これを守れない設計（引数の置き換えが避けられない）になった場合、Step 3 は `[hours]` ではなく**本番故障の窓を持つ変更**として扱い、「migration 適用完了を確認してから app を deploy する」二段手順を実行手順に足す

この制約が無いと、旧バンドルを開いたまま予定を作成・編集したユーザーの RPC 呼び出しがその窓の間だけ失敗する。§2 が「deploy 間隙のリスクは純追加 → cutover → drop の順序だけで閉じる」と書いているのは Step 1 の話であって、**Step 3 には順序だけでは効かない**。

### Step 4 の可逆性は Step 5 merge 前までしか持たない

Reversibility Table は各 Step を独立に評価しているが、cutover の revert コストは**後続 Step が積まれるほど上がる**。Step 5（分析軸）や Step 6（公開契約）が production に乗った後は、それらが activity ベースのコードに依存しているため Step 4 だけの `git revert` は conflict する。

つまり `[minutes]` が有効なのは **Step 4 merge 後・Step 5 merge 前**の窓だけ。この窓の間に Sentry と主要動線（カレンダー表示・作成・編集・検索）の確認を済ませる。窓を過ぎたら、戻す単位は「Step 4〜6 をまとめて」になる。

### Step 4 から Step 6 までの窓 — MCP 経由の分類が UI に出ない

Step 3 を additive-only にした帰結として、**Step 6（公開契約の切替）が merge されるまで MCP クライアントは旧 `tags.list` と `tagId` パラメータを使い続けられる**。RPC はまだ `p_tag_id` を受け付けるので書き込みは成功するが、cutover 済み（Step 4）の UI は `activity_id` しか読まない。つまり **MCP 経由で作られたブロックは `tag_id` を持っているのに画面では「アクティビティなし」に見える**。

Step 4 と Step 5 の間の劣化（§前節）と同じ性質だが、**Step 6 はレーン未割当なので窓が無期限に開きうる**点が違う。閉じ方は 2 つ:

- Step 6 を Step 4 の直後に割り当てて窓を有界にする（推奨）
- 割り当てられない場合は、**Step 4 の PR 本文に「Step 6 merge まで MCP 経由の分類は UI に反映されない」ことを明記する**（Step 4/5 間の劣化と同じ扱い）

どちらも運用の手当てで閉じるので、設計そのものは変えない。

### Step 4 と Step 5 の間の劣化を許容する理由

Step 4 と 5 を 1 PR に束ねると、tag-filter 25 ファイル + calendar + timeblock + review が同時に動く巨大な差分になり、クロスレビュー 1 巡で読み切れない（`workflow.md` §判定 3 問 の上限ガード）。分けると、その間だけ分析画面が新規ブロックを未分類として扱う。単一ユーザー・課金前・1 merge サイクルの窓なので、レビュー品質を優先して劣化を受け入れる。**Step 4 の PR 本文に、この劣化が発生することと解消 Step を明記する。**

### Step 4 から Step 6 までの窓は H1 が閉じる

以前の編成では Step 6 が未割当で、「MCP 経由で作ったブロックが画面上『アクティビティなし』に見える」窓が無期限に開く懸念があった。**H1（Step 3 = 参照切替）を F の前に差し込む確定編成で、この窓は当日中に閉じる**。H2（Step 6）が merge されるまでは MCP クライアントが旧 `tagId` を送れるが、H1 で `apply_mcp_*` が activity を書けるようになっているため、UI に出ない状態は生じない。

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

- **既存タグデータの移行をしない**（User 裁可 2026-08-18 確定。移行が構造的には安価であるという反対証拠を提示した上で「作り直したいから捨てる」の積極選択として再確認済み）
- **`sort_order` と並べ替え UI を作らない**（§4-7）。名前順で始める
- **アクティビティごとの色・アイコンを持たせない**（§4-6）
- **マージ（統合）機能を v1 で作らない**（§4-8、User 裁可確定）。`is_active` 墓標状態ごと落とす
- **セグメントに期間・指標・グルーピングを保存させない**（§6-3、§6-4）。レポートビルダーを作らない
- **セグメント専用ページを作らない**（[strategy.md](../../strategy.md) §4-10）
- **`plans` / `records` にセグメント参照列を作らない**（§3）。セグメントが第 2 の分類軸に育つ道を構造で塞ぐ
- **`read:tags` scope を即座に削除しない**（§7-4）。alias で受ける
- **既存 migration ファイルを書き換えない**。drop は新規 migration 1 本で行う
- **1 PR に code removal と destructive migration を混ぜない**（Step 7 / 8 の分離）
- **Free/Pro の enforcement をこの project で実装しない**（§12-1 d）。「タグ 5 個まで」の文言を消すところまで。境界の決定は #1336
- **ついでのリファクタをしない** — `useShellStore` の `activeSheet` は tag 系 3 種を差し替えるだけにし、sheet 機構そのものは触らない

## 12. 確定した判断と、残る未決

2026-08-18 に User 裁可と指揮台采配で大半が決着した。**決着済みを先に置き、未決は 1 件だけ残る。**

### 12-1. 確定（User 裁可、2026-08-18）

| #   | 論点                         | 決定                                                                                                                             | 備考                                                                                                                                                                                                                |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | 既存タグデータの移行         | **移行しない（捨てる）**                                                                                                         | 「移行は `INSERT ... SELECT` 1 本で安い」という反対証拠を提示した上で再確認され、**「作り直したいから捨てる」の積極選択**として確定。cutover 直後に既存ブロックが全部「アクティビティなし」になることを織り込み済み |
| b   | マージ（統合）機能           | **v1 で落とす**                                                                                                                  | `is_active` 墓標状態ごと消え、状態モデルが「通常 / アーカイブ」の 2 つに単純化する                                                                                                                                  |
| c   | `read:tags` scope            | **実測条件付き**: production の grant が 0 件なら alias なしクリーン置換、1 件以上なら deprecated alias を残す。実測は H2 着手時 | **設計としては 0 件でも alias 維持を推奨する**（下記 §12-3）                                                                                                                                                        |
| d   | Free/Pro の「タグ 5 個まで」 | **文言を消す最小対応**。実質判断は [#1336](https://github.com/Dayopt/dayopt/issues/1336) へ                                      | User の「保留」と整合                                                                                                                                                                                               |
| e   | `strategy.md` の語彙更新     | **Step 0 に含めて承認**（思想不変・語彙のみ）                                                                                    | §4-1「所有するのは時間とタグだけ」/ §4-2「タグが語彙」を更新。§4-2 の「3 階層以上や自由なメタデータを許さない」は本設計でも守られている（深さは 2 のまま、メタデータは増えない）                                    |

### 12-2. 確定（指揮台采配、2026-08-18）

- **`@dnd-kit` は playground 2 ディレクトリごと削除**してレーン F の scope に含める（シンプルルール 5 適合・`git revert` 可逆）
- **Step 7（非破壊 cleanup）は本日 scope 外**。明日以降の編成へ
- **GDPR export / `deleteAllData` の新テーブル対応は E1 に含める**（テーブル追加と同時でないと漏れの穴が開く）
- **GRANT はパターン A、`anon` なし**（§4-5）。未分類アクティビティの同名重複は許さない（§4-2）
- merge 順 `F → E1 → H1 → F2 → H2 → G`（§9、[2026-08-18 更新](https://github.com/Dayopt/dayopt/issues/2162)）

### 12-3. 残る未決 — `read:tags` alias を 0 件でも残すか

User 裁可 c は「実測 0 件ならクリーン置換」だが、**その裁可の後にレーン H の実測でリスクの非対称性が判明した**ので、設計としては**推奨を上げ直す**。

`read:tags` を `SUPPORTED_SCOPES` から外すと、壊れ方は「tags だけ見えなくなる」ではなく **`parseStoredScopes` の all-or-nothing gate によってその接続の MCP 呼び出しが全部 401 になる**（§7-4 に実測経路）。

- **失う側に天井がない**（接続ごと死ぬ）のに、**維持コストは `SUPPORTED_SCOPES` の 1 行**
- `decision-principles.md` ルール 1「破滅に賭けるな」— 期待値ではなく、失敗したときに何が残るかで判断する
- grant 実測が 0 件でも、**実測と deploy の間に新しい grant が発行される窓**がある

**推奨: 実測結果によらず alias を残す。** 掃除は Step 8 のタイミングで、既存 receipt / grant が全部期限切れになってから行う。この推奨は User 裁可 c を覆すものなので、**指揮台経由で 1 度だけ確認したい**（実測 0 件だった場合にどちらを採るか）。

## 13. 検証

- **Step 3 の前に characterization test を書く（最優先）**。実測で判明した空白: `assert_active_timeblock_tag_v1` は**実 DB に対して一度も呼ばれておらず**、`enforce_plan_tag_owner` / `enforce_record_tag_owner` にも test が 1 本も無い。§4-4 でトリガーを複合 FK へ置き換えるのに、置き換え前の挙動を凍結した test が無いと「同じ保証が維持された」ことを機械的に示せない。先に次を実 DB に対して固定し、その後 activity 版で同じ 4 点が成立することを assert する（tag 版・activity 版を並べて置く）:
  1. アーカイブ済み tag を指す `create_plan_command_v1` → `DT014`
  2. 他ユーザーの tag を指す `create_plan_command_v1` → `DT001`
  3. `enforce_plan_tag_owner` / `enforce_record_tag_owner` の cross-user 拒否
  4. 三状態 × 無効な tag（`p_tag_id_present: true` かつアーカイブ済み）— **現在この組み合わせだけ未カバー**
- **DB レベル test は `pnpm test:integration` の 1 層だけ**（pgTAP も `supabase/tests/` も無い）。`USE_LOCAL_DB=true` で `describe.skipIf` が解除される形なので、**素の `pnpm test:run` では全部 skip されて緑になる**。実測時は passed 件数を読む（`.claude/rules/quality.md` §条件付き skip の検証）
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
