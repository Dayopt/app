---
status: paused
last_verified: 2026-07-23
code: supabase/migrations
---

# migration-baseline-squash — 次回 baseline squash の実施計画

2 回目の baseline squash を「いつ・どの範囲を・どの手順で」行うかを確定した計画書。
**本書の作成時点では squash を実施しない**（`status: paused`）。実施は下記の判定基準を満たすリリース境界で、専用 issue と専用 PR で行う。

決定の経緯は [2026-07-23 の decision ログ](../../engineering/log/2026-07-23-migration-baseline-squash-plan.md)、前回（2026-03-17）の運用実績は [`supabase/migrations/_archive/README.md`](../../../supabase/migrations/_archive/README.md) が正。

## Goal

`supabase/migrations/` の active migration を新しい baseline 1 ファイルへ圧縮し、`db reset` の所要時間と「現在のスキーマを読み解くコスト」を下げる。スキーマの実体は 1 ミリも変えない。

## 現状（2026-07-23 実測）

| 項目                                                                                   | 実測値                                                      |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `supabase/migrations/*.sql`                                                            | 142（`00000000000000_baseline.sql` + baseline 以降 141）    |
| うち `fix_` / `drop_` を名前に含む                                                     | 51（baseline 以降の約 36%）                                 |
| `remove` / `cleanup` / `repair` / `restore` / `backfill` / `unschedule` も含めた是正系 | 62                                                          |
| production `supabase_migrations.schema_migrations`                                     | 142 行（`00000000000000` 〜 `20260716031801`）              |
| `_archive/`（前回 squash 分）                                                          | 116 ファイル、flat、`00000000000000` 〜 `20260317000001`    |
| Supabase CLI                                                                           | `2.109.1`（root / `apps/product` の `package.json` で pin） |

ローカルの 142 ファイルと production の 142 行が一致しており、**履歴の**ドリフトはない。実スキーマの一致は別途 §5 の差分ゲートで確認する。

短命な追加→削除の例: `20260407000000_create_user_badges` → `20260430120000_drop_user_badges`、`20260319130002_add_palette_items` → `20260413000000_drop_palette_items`。これらは新 baseline では跡形もなく消える。

## 前回 squash が実際に起こした障害（最重要の前提）

前回の baseline は「非スキーマ要素の写経漏れ」を 2 件出しており、**うち 1 件は実障害になった**。この計画の安全策はすべてここから逆算する。

### 1. table GRANT の欠落 → clean local / Preview DB が壊れた（実障害）

[`20260713121911_restore_baseline_table_grants.sql`](../../../supabase/migrations/20260713121911_restore_baseline_table_grants.sql) の冒頭コメントが経緯を記録している。要旨は、squash された baseline が Supabase の default table grant を含まなかったため、production は archive 済み履歴から grant を引き継いでいた一方、**clean な local / Preview DB では RLS ポリシーが走る前にクライアントが失敗した**、というもの。修復は squash から約 4 か月後（2026-07-13）。

production だけを見ていると気づけない種類の欠落である点が重要。`db diff --linked` は production と比較するため、production 側に grant が残っている限り差分として現れない。

### 2. storage bucket の MIME 列の欠落（未修復のまま）

`_archive/20251218072948_create_attachments_bucket.sql` は `text/csv` を含む 7 種の MIME を持っていたが、現行 baseline の attachments 行は 6 種しか持たない。production は `text/csv` を保持しているため実害は出ていないが、**baseline から再構築した環境だけが異なる**状態が続いている。

### 教訓

- 列・GRANT の写経漏れは仮説ではなく **2 回とも起きた実績**がある
- 現行 baseline は生の CLI 出力ではなく手でキュレーションされた成果物であり、その手作業が漏れの発生源だった
- 検証を production との比較だけに頼ると、この種の欠落は構造的に検出できない

## 実施タイミングの判定基準

以下 3 条件が同時に揃う最初のリリース境界で実施する。

1. **migration を含む open PR がゼロ** — PR ごとの Supabase Preview branch は親（production）の migration 履歴を基に作られるため、squash 中に開いている PR は履歴不整合になる
2. **進行中の大規模スキーマ変更 project がない** — [time-model-split](../time-model-split/summary.md) は 2026-07-13 に `done`。同種の大規模変更が走っていないこと
3. **リリース直後の静穏期** — 直近リリースが production で安定し、次のリリースまで間があること。squash 直後に hotfix migration を打つ状況を避ける

さらに実施ウィンドウ中は、**squash PR 以外の main への merge を、migration を含むか否かに関わらず止める**。手順 6（merge）と手順 7（repair）の順序が前提を成すため。

> 判定基準 1 と 3 は「実施日を選ぶ」ためのもので、squash 自体を先送りする理由にはならない。migration が増え続ける限り、次のリリース境界で実施する。

## 範囲と新 baseline の時点

- **圧縮対象**: `00000000000000_baseline.sql` を含む、実施時点の active migration **全件**（本書作成時点で 142 件）
- **新 baseline の version**: `00000000000000` を維持し、`00000000000000_baseline.sql` の**中身を置き換える**
  - production の `schema_migrations` には既に `00000000000000` が applied として入っている。version を据え置けばその行を再利用でき、production 側の repair は「baseline 以降を reverted にする」片方向で済む
  - 前回方式（version 据え置き）の踏襲でもある。**これは version 採番についての決定であり、「前回と同じ手作業をする」という意味ではない**
- **`_archive/` の扱い**: flat 構造を維持し、今回の 141 件を同じ階層に追加する。`_archive/README.md` に第 2 回のレンジを追記する

### `supabase migration squash` を使わない理由

pin 版 CLI 2.109.1 の `migration squash --help` は `--version string  Squash up to the specified version.` と表示する。これは**出力先の指定ではなく squash 範囲の終端**である。したがって `--version 00000000000000` は「baseline までを squash」＝実質 no-op になる。

さらに squash は圧縮対象のファイルを**自分で削除し、残った最後のタイムスタンプのファイルに書き込む**。これを使うと、

- 新 baseline のファイル名が `00000000000000_baseline.sql` ではなく最新 migration の名前になり、version 据え置きの決定と衝突する
- 圧縮対象ファイルが消えるため、`_archive/` への `git mv` が `fatal: bad source` で失敗する

以上から、**前回同様 `supabase db dump` でスキーマを書き出す方式**を採る。CLI の squash サブコマンドは使わない。

## 非スキーマオブジェクトの扱い（最重要リスク）

`db dump` の出力から落ちるものは 2 種類ある。**どちらも「production では無事だが、新しい local / Preview だけが壊れる」形の障害になる**（§前回障害と同じ構造）。

1. **データ行** — `INSERT` / `UPDATE` / `DELETE`。公式リファレンスも欠落対象に cron ジョブ・storage バケット・vault シークレットを明記している
2. **managed schema のオブジェクト** — `db dump` は `--exclude-schema` に `auth` / `storage` / `extensions` / `cron` / `vault` などを既定で指定する（pin 版 2.109.1 で `--dry-run` により実測）。これらのスキーマ**内に定義された**オブジェクトは出力されない

2 が特に危険で、現行 baseline は以下を持っているが `db dump` では再現されない。

- `auth.users` への `AFTER INSERT` トリガー（`on_auth_user_created` → `public.handle_new_user()`）— **落ちると新規登録でプロフィールが作られない**
- `storage.objects` への RLS ポリシー群 — **落ちるとストレージのアクセス制御が消える**

> `public` のテーブルが `REFERENCES auth.users(id)` を持つのは問題ない。FK は `public` 側のテーブル定義の一部として出力される。危険なのは **auth / storage スキーマ側に住んでいるオブジェクト**（トリガー・ポリシー）。

production の実測（2026-07-23）と対応方針:

| オブジェクト                   | production の現状                           | 新 baseline での扱い                                             |
| ------------------------------ | ------------------------------------------- | ---------------------------------------------------------------- |
| `auth.users` トリガー          | 1 件（`on_auth_user_created`）              | **手で復元**。`db dump` に含まれない                             |
| `storage.objects` RLS ポリシー | 9 件（現行 baseline とは不一致。下記参照）  | **手で復元**。`db dump` に含まれない                             |
| table GRANT（`public`）        | archive 済み履歴由来の default grant を保持 | **必ず出力に含まれることを確認**。§前回障害 1 の再発点           |
| storage bucket 行              | 2 件（下表の全カラム）                      | `INSERT ... ON CONFLICT DO NOTHING` を**全カラム**で復元する     |
| pg_cron job                    | **0 件**（`cron.job` が空）                 | 何も書かない。旧 baseline の 4 件を写経しない                    |
| vault secret                   | **0 件**（`vault.secrets` が空）            | 何も書かない。vault 拡張の有効化 / helper 関数は schema 側に残る |
| backfill 系 DML                | 一度きりの実行済みデータ移行                | 復元しない（新規環境には移行対象データがない）                   |

### storage.objects のポリシーは production と baseline が既に食い違っている

production は 9 件、現行 baseline は 7 件で、**名前が一致するのは 1 件だけ**（production の `Users can upload their own avatar` に対し baseline は `Users can upload own avatar` など）。

原因は §前回障害 1 と同じ機構である。production は `migration repair --status applied` で baseline を「適用済み」とマークしただけで**実行していない**ため、archive 済み migration 由来の旧ポリシーを保持し続けている。一方 local / Preview は baseline を実行するので baseline 側の 7 件になる。**現時点で両者は別物**。

squash はこのずれを解消する機会でもある。実施時は production を正として読み取り、新 baseline に書く。

### storage bucket は全カラムを取る

`public` だけでは足りない。2026-07-23 時点の production 実測値:

| id            | public  | file_size_limit    | allowed_mime_types                                            |
| ------------- | ------- | ------------------ | ------------------------------------------------------------- |
| `attachments` | `false` | `10485760`（10MB） | jpeg / png / gif / webp / pdf / `text/plain` / **`text/csv`** |
| `avatars`     | `true`  | `5242880`（5MiB）  | jpeg / png / gif / webp                                       |

**この 2 行はどちらも現行 migration から再現できない。**

- 全 142 件を grep しても `file_size_limit` / `allowed_mime_types` の指定は baseline の attachments 行 1 箇所だけ。**avatars の 5MiB 制限と MIME allowlist を設定した migration は存在しない**
- attachments の `text/csv` も現行 baseline にはない（§前回障害 2）

したがって production の値は migration 由来ではなく、squash は**これを版管理下へ戻す機会**でもある。実施時は必ず全カラムを `SELECT` してスナップショットを取り、その値を baseline に書く。

> `supabase/config.toml` の `[storage.buckets.avatars]` は**ローカル専用**の宣言で、production には効かない。逆に言えば、ローカルは config.toml から 5MiB を受け取るため、**baseline が無言でも手元では正しく見える**。手順 5 のローカル検証はこの欠落を検出できない。

## 手順書ドラフト

実施 issue ではこの順序を踏み、各ステップの出力を PR に貼る。コマンドの正確なフラグは実施時点の CLI（当時の pin 版）で `--help` に再照合する。

### 1. 事前確認とスナップショット取得

```bash
git switch main && git pull
supabase migration list --linked   # ローカルと production の履歴が一致することを確認
gh pr list --state open            # open PR を目視で確認
```

read-only の supabase MCP で以下を取得し、**出力を実施 issue に貼る**。これが後続すべての正本になる。

- `supabase_migrations.schema_migrations` の全行（`version` / `name`）— repair 対象一覧と roll-forward の入力
- `storage.buckets` の全カラム — baseline へ復元する値
- **`auth.users` の非内部トリガー**（`pg_trigger` を `tgisinternal = false` で絞る）— baseline へ復元する対象
- **`storage.objects` の RLS ポリシー全定義**（`pg_policies` の `qual` / `with_check` を含む）— baseline へ復元する対象
- `cron.job` / `vault.secrets` — 復元不要であることの確認

### 2. 新 baseline の生成

```bash
supabase db reset                                              # 既存 migration 全適用でローカルを最新状態に
supabase db dump --local -f supabase/migrations/00000000000000_baseline.sql
```

`--linked` を付けると production を対象にする。ローカルを対象にするため **`--local` を明示する**。

生成後、**出力に `auth` / `storage` スキーマのオブジェクトが 1 つも含まれていないこと**を確認する（既定の `--exclude-schema` により必ず落ちる）。含まれていないのが正常であり、手順 3 で手当てする前提を再確認する意味を持つ。

### 3. 落ちたオブジェクトの手当て

生成された baseline に対して、手順 1 のスナップショットを正として以下を追記する。

1. **`auth.users` のトリガー** — `on_auth_user_created`（`public.handle_new_user()` を呼ぶ）。トリガー関数自体は `public` にあるので dump に含まれるが、**`auth.users` に張る `CREATE TRIGGER` は含まれない**
2. **`storage.objects` の RLS ポリシー** — production 側の定義をそのまま書く。現行 baseline の 7 件は production の 9 件と食い違っているため、**旧 baseline から写経しない**
3. **`storage.buckets` の全カラム** — `INSERT ... ON CONFLICT (id) DO NOTHING`
4. **table GRANT が出力に含まれているか確認する**（§前回障害 1）。含まれていなければ [`20260713121911_restore_baseline_table_grants.sql`](../../../supabase/migrations/20260713121911_restore_baseline_table_grants.sql) 相当の `GRANT` を追記する
5. cron / vault は復元しない

旧 baseline の該当ブロックは**構造の参考にとどめ、値は必ず手順 1 のスナップショットに合わせる**。旧 baseline の cron 4 件・`avatars.public = false`・storage ポリシー 7 件はいずれも現状とずれており、写経してはならない。

### 4. 旧 migration の退避

年に依存しない形で、baseline 以外の全ファイルを移す。

```bash
find supabase/migrations -maxdepth 1 -name '*.sql' \
  ! -name '00000000000000_baseline.sql' \
  -exec git mv {} supabase/migrations/_archive/ \;
```

`2026*` のような年リテラルを使わない。実施が 2027 年以降になると `2027*` の migration が静かに取り残され、手順 7 で履歴だけ消えて再適用の対象になる。

`grep -v baseline` のような名前ベースの除外も使わない。`20260713121911_restore_baseline_table_grants.sql` を誤って残す（実測で確認済み）。除外はファイル名の完全一致で行う。

移動後、件数が手順 1 のスナップショット行数 − 1 と一致することを確認する。`_archive/README.md` に第 2 回のレンジと日付を追記する。

### 5. ローカル検証

```bash
supabase db reset            # 新 baseline 単体でスキーマが構築できるか
```

**型の比較は squash 前後のローカル同士で行う。** `pnpm types:generate:local` はコミット済みの型ファイル（`types:generate:production` で production から生成されたもの）を上書きするため、これと比較しても squash と無関係な構造差が出る（実測で 2133 行）。合格判定に使えない。

```bash
# squash 前（作業ブランチを切る前）に取得しておく
supabase gen types typescript --local > /tmp/types-before.ts
# squash 後
supabase gen types typescript --local > /tmp/types-after.ts
diff /tmp/types-before.ts /tmp/types-after.ts    # 差分ゼロが合格
```

加えて production とのスキーマ差分がゼロであることを確認する。

```bash
supabase db diff --linked
```

**ただし `db diff` は行データを見ない。** storage bucket の行はスキーマではなくデータなので、公式ドキュメントも bucket の変更を `db diff` の既知の非対応ケースとして挙げている。手順 3 の写経ミスや書き漏れはこのゲートを素通りし、**新しい local / Preview 環境でだけ壊れる**（§前回障害と同じ形）。

そのため、`db reset` 後のローカル DB から**実際に読み戻して**手順 1 の production スナップショットと突き合わせる。目視ではなく差分コマンドで判定する。

```bash
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -At -F',' \
  -c "select tgname from pg_trigger
      where not tgisinternal and tgrelid = 'auth.users'::regclass order by tgname;" \
  > /tmp/auth-triggers-local.csv
# storage.objects のポリシー、table GRANT も同様に読み出して production 側と diff する
```

この読み戻しで検証できるのは、**config.toml が作らないオブジェクトだけ**である。

- `auth.users` の非内部トリガー（`pg_trigger` / `tgisinternal = false`）
- `storage.objects` の RLS ポリシー（`pg_policies` の `qual` / `with_check` を含む全定義）
- table GRANT（`information_schema.role_table_grants`）— 前回はここが漏れて実障害になった

#### `storage.buckets` だけはローカル読み戻しで検証できない

`supabase/config.toml` の `[storage.buckets.avatars]` は `db reset` 時にローカルへ適用される。したがって **baseline の `INSERT` が抜けていても、ローカルの `storage.buckets` は config.toml 由来の正しい値を返す**。ローカルを読んでも合格してしまい、欠落は Preview / 新規 project でだけ表面化する。

bucket は次の 2 つで検証する。ローカル DB の読み戻しを合格根拠にしない。

1. **生成物そのものを検査する** — `00000000000000_baseline.sql` 内の `INSERT INTO storage.buckets` を直接読み、手順 1 のスナップショットと全カラムを突き合わせる（`grep -A5 'INSERT INTO storage.buckets' supabase/migrations/00000000000000_baseline.sql`）
2. **PR だけから構築された環境で読む** — 手順 8 の Preview branch で `storage.buckets` を読み出して production スナップショットと diff する。config.toml の影響を受けない唯一の実環境検証

**いずれかで差分が出た場合は squash を中止し、原因を先に潰す。**

### 6. PR を main へ merge する（production を触る前のゲート）

**production の履歴を触る前に、新 baseline 1 ファイルの状態を main へ merge する。** 順序を逆にしてはならない。

手順 6 と 7 の間には、main（1 ファイル）と production 履歴（142 行）が食い違う窓が必ず生じる。**どちらの順序でも窓は避けられない**ので、失敗の質で選ぶ。

- **merge が先**（採用）: production 履歴に、ローカルに存在しない 141 version が残る。pin 版 CLI はこの状態を `missing-local` と判定し、`Remote migration versions not found in local migrations directory.` で**失敗して停止する**（バイナリ内の文字列で確認済み）。何も適用されない
- **repair が先**（不採用）: production 履歴が 1 行になった時点で main にはまだ 141 件の SQL が残る。CLI はこれらを未適用と見なし、**適用済みの SQL を実際に再実行しにいく**。途中まで走って壊れる

前者は「拒否して止まる」、後者は「壊しにいく」。前者を採る。

> **merge 直後の deploy は失敗するのが正常。** これは異常ではなく、手順 7 を完了するまでの想定内の状態である。deploy の green を手順 7 の前提条件にしてはならない（構造上 green にならない）。merge と repair は**同じロック済みウィンドウ内で連続して実施し、間を空けない**。

### 7. production の履歴を合わせる

`migration repair` は**追跡テーブルを書き換えるだけで SQL を適用も巻き戻しもしない**。実 DB のスキーマは squash 前後で不変なので、記録の整合を取る操作に過ぎない。

実行前に、手順 1 のスナップショットと `_archive/` へ退避した version 集合が一致すること、`00000000000000` が対象に含まれていないことを確認する。

```bash
supabase migration repair --linked --status reverted <version...>
```

`<version...>` は可変長引数で、全 version を 1 回で渡せる。`--linked` を明示する。

> 手順 6 を先に済ませていても、実施ウィンドウ中は **migration の有無に関わらず main への merge を止める**。squash PR 以外が割り込むと、上記の「どちらが先か」の前提が崩れる。

### 8. 事後検証

```bash
supabase migration list --linked   # ローカル 1 件 / production 1 件で一致
```

適当な PR を 1 本開き、**新しい Preview branch が新 baseline から正常に作成される**ことを確認する。ここまで通って初めて完了とする。

Preview branch は clean DB に migration を適用する方式なので、この確認は §前回障害（clean DB でのみ壊れる欠落）に対する最も有効なゲートになる。手順 3 で手当てした 4 種すべてを実機で踏む:

- **新規ユーザーで signup し、プロフィールが作られる**こと（`auth.users` トリガー）
- **avatars / attachments のアップロードと閲覧**ができること（storage ポリシー + bucket 行）
- 通常のデータ読み書きが RLS を通ること（table GRANT）

加えて、Preview branch の `storage.buckets` を全カラムで読み出し、手順 1 の production スナップショットと diff する。**config.toml の影響を受けない唯一の bucket 検証**であり、ここを通って初めて手順 3-3 が検証済みになる。

## preview branch / 新規環境への影響

- **実施中の open PR**: 親の履歴が変わるため、squash 前に開いていた PR の Preview branch は不整合になる。既存 PR は squash 後に main を取り込んで Preview branch を作り直す
- **新規環境 / ローカル**: `supabase db reset` が新 baseline 1 ファイルからスキーマを構築する。適用ファイル数が 142 → 1 になり reset が速くなる（これが主な便益）
- **production**: スキーマ変更ゼロ。変わるのは `supabase_migrations.schema_migrations` の行数のみ
- **`_archive/`**: CLI は `supabase/migrations/` 直下の `*.sql` だけを適用するため、退避分は適用対象外のまま

## リスクと可逆性

| リスク                                      | 影響                                             | 対応                                                                                                                                        |
| ------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.users` トリガーの欠落                 | **新規登録でプロフィールが作られない**           | `db dump` が `auth` を除外する前提で手順 3-1 に組み込み + 手順 5 の読み戻し + 手順 8 の signup 実機確認                                     |
| `storage.objects` ポリシーの欠落            | **ストレージのアクセス制御が消える**             | 同上（手順 3-2 / 手順 5 / 手順 8 のアップロード実機確認）                                                                                   |
| GRANT の欠落                                | **clean local / Preview のみ壊れる**（前例あり） | 手順 3-4 の明示確認 + 手順 5 の grant 読み戻し + 手順 8 の Preview 実機確認                                                                 |
| storage bucket の列の写経漏れ               | 新規環境だけバケット制約が緩む（前例あり）       | baseline SQL の直接検査（手順 5）+ Preview branch での読み戻し（手順 8）。**ローカル読み戻しは config.toml が値を補うため合格根拠にしない** |
| dump 出力が production スキーマとずれる     | 新規環境だけ壊れる                               | 手順 5 の差分ゼロ確認を通過ゲートにする。ずれたら中止                                                                                       |
| 退避漏れ（年リテラル等）                    | 適用済み SQL の再実行を招く                      | 手順 4 の年非依存コマンド + 件数突合                                                                                                        |
| `migration repair` の対象漏れ               | production 履歴とローカルが不一致                | 手順 8 の `migration list --linked` で一致を確認                                                                                            |
| repair を merge より先に打つ                | **適用済み SQL の再実行で適用経路が閉塞**        | 手順 6（merge）を手順 7（repair）の前段ゲートにする + 実施ウィンドウ中の main merge 凍結                                                    |
| squash 直後に hotfix migration が必要になる | 手順が輻輳する                                   | 判定基準 3（リリース直後の静穏期）で回避                                                                                                    |

**可逆性は `[hours]`**。roll-forward を基本とする。

- ファイル側: PR の revert で `_archive/` からの復帰と旧 baseline の復元が一度に戻る
- production 履歴側: `supabase migration repair --linked --status applied <version...>` で reverted にした分を戻す
- **順序に依存する**: `--status applied` は対象 version のファイルが `supabase/migrations/` 直下に存在しないと失敗する（`_archive/` にあるだけでは不可。実測で確認済み）。**必ずファイルを先に戻してから repair する**
- 復帰対象の version 一覧は手順 1 のスナップショットが正本。これを取っていないと roll-forward が成立しない
- **実 DB のスキーマは一切変更していない**ため、最悪ケースでも「履歴テーブルの記録がずれる」に留まり、ユーザーデータは影響を受けない

## 実施 issue を切る時のチェックリスト

- [ ] 判定基準 3 条件を満たしていることを本文に記載する
- [ ] 実施時点の migration 件数と production 履歴の行数を再実測し、一致を確認する
- [ ] `storage.buckets`（全カラム）/ `cron.job` / `vault.secrets` を再実測する（本書の値は 2026-07-23 時点。**実施時に必ず取り直す**）
- [ ] CLI の `db dump` / `migration repair` のフラグを、実施時点の pin 版で `--help` に再照合する
- [ ] `_archive/README.md` の更新を成果物に含める
- [ ] [#1462 migration failure recovery](https://github.com/Dayopt/dayopt/issues/1462) の復旧手順と矛盾しないか確認する

### EXPLICIT AUTHORITY の安全策

production の `supabase_migrations.schema_migrations` を書き換えるため、[AGENTS.md](../../../AGENTS.md) の「Authority levels」に従い、**承認だけでは着手条件を満たさない**。

- [ ] **承認** — 対象（production project `yvglwblxrnrenfifsnje`）・環境・操作（退避分への `migration repair --status reverted`）を特定した明示指示を得る
- [ ] **独立レビュー** — `risk-reviewer` に手順書と repair 対象 version 一覧をレビューさせ、結果を実施 issue に貼る（AGENTS.md の Read-only delegation で `migration` は自動委任条件）
- [ ] **backup** — 手順 1 の `schema_migrations` 全行スナップショットを取得済みで、実施 issue に貼ってある
- [ ] **Preview / dry-run** — 手順 5 の差分ゼロ（型 / `db diff` / **auth トリガー・storage ポリシー・GRANT の読み戻し** / baseline SQL 内の bucket 行の直接検査）と手順 8 の Preview 実機確認（signup・アップロード・bucket 読み戻し）を通過ゲートとし、各出力を PR に貼る
- [ ] **merge 順序** — 手順 6（main へ merge）を手順 7（production の repair）より先に済ませ、**同じロック済みウィンドウ内で連続実施する**。逆順は適用済み SQL の再実行を招く。merge 直後の deploy 失敗（`missing-local`）は想定内であり、これを green にすることを手順 7 の前提にしない
- [ ] **roll-forward** — §リスクと可逆性 の復帰手順を、backup から生成した version 一覧付きで実施 issue に転記する（ファイルを先に戻す順序を含む）
- [ ] 上記のいずれかを満たせない場合は**実施しない**。現実的な failure mode を報告して中止する

## Related Documents

- [decision: 次回 baseline squash の範囲・時点・タイミングを確定する](../../engineering/log/2026-07-23-migration-baseline-squash-plan.md)
- [`supabase/migrations/_archive/README.md`](../../../supabase/migrations/_archive/README.md) — 前回 squash の運用実績
- [`supabase/schemas/README.md`](../../../supabase/schemas/README.md) — squash 後もヘッダーを書き換えない方針
- [`docs/engineering/data/db/rls-snapshot.md`](../../engineering/data/db/rls-snapshot.md) — RLS の自動生成スナップショット
- 関連 issue: [#1523](https://github.com/Dayopt/dayopt/issues/1523)
