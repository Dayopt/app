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

**ローカルの 142 ファイルと production の 142 行が完全一致しており、履歴のドリフトはない。** これは squash の前提条件が現時点で満たされていることを意味する。

短命な追加→削除の例: `20260407000000_create_user_badges` → `20260430120000_drop_user_badges`、`20260319130002_add_palette_items` → `20260413000000_drop_palette_items`。これらは新 baseline では跡形もなく消える。

## 実施タイミングの判定基準

以下 3 条件が同時に揃う最初のリリース境界で実施する。

1. **migration を含む open PR がゼロ** — PR ごとの Supabase Preview branch は親（production）の migration 履歴を基に作られるため、squash 中に開いている PR は履歴不整合になる。実施ウィンドウ中は migration を含む PR の merge を止める
2. **進行中の大規模スキーマ変更 project がない** — [time-model-split](../time-model-split/summary.md) は 2026-07-13 に `done`。同種の大規模変更が走っていないこと
3. **リリース直後の静穏期** — 直近リリースが production で安定し、次のリリースまで間があること。squash 直後に hotfix migration を打つ状況を避ける

> 判定基準 1 と 3 は「実施日を選ぶ」ためのもので、squash 自体を先送りする理由にはならない。migration が 141 件を超えて増え続ける限り、次のリリース境界で実施する。

## 範囲と新 baseline の時点

- **圧縮対象**: `00000000000000_baseline.sql` を含む、実施時点の active migration **全件**（本書作成時点で 142 件）
- **新 baseline の version**: `00000000000000` を維持し、`00000000000000_baseline.sql` の**中身を置き換える**
  - production の `schema_migrations` には既に `00000000000000` が applied として入っている。version を据え置けば、その 1 行をそのまま再利用でき、production 側の `migration repair` は「baseline 以降 141 件を reverted にする」だけで済む
  - 新 version を採番すると applied 行の追加と削除が両方必要になり、手順が増える。前回方式（version 据え置き）を踏襲する
- **`_archive/` の扱い**: flat 構造を維持し、今回の 141 件を同じ階層に追加する。`_archive/README.md` に第 2 回のレンジ（`20260317022728` 〜 実施時点の最終 version）を追記する

## 非スキーマオブジェクトの扱い（最重要リスク）

`supabase migration squash` が生成するのは**スキーマのみのダンプ相当**で、`INSERT` / `UPDATE` / `DELETE` は落ちる。Supabase 公式 CLI リファレンスは、この欠落に **cron ジョブ・storage バケット・vault の暗号化シークレット**が含まれると明記している。

現行 `00000000000000_baseline.sql` はこれらを手書きで保持している（`storage.buckets` への `INSERT` 2 件、`cron.schedule` 4 件）。つまり**前回の baseline は生の squash 出力ではなく、手でキュレーションされた成果物**である。今回も同じ手当てが要る。

production の実測（2026-07-23）と対応方針:

| オブジェクト    | production の現状                                                                | 新 baseline での扱い                                             |
| --------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| pg_cron job     | **0 件**（`cron.job` が空。baseline の 4 件は対象削除に伴い unschedule 済み）    | 何も書かない。旧 baseline の 4 件を写経しない                    |
| storage bucket  | **2 件**: `attachments`（private, 10MB, MIME 制限あり）/ `avatars`（**public**） | `INSERT ... ON CONFLICT DO NOTHING` を手書きで復元する           |
| vault secret    | **0 件**（`vault.secrets` が空）                                                 | 何も書かない。vault 拡張の有効化 / helper 関数は schema 側に残る |
| backfill 系 DML | 一度きりの実行済みデータ移行                                                     | 復元しない（新規環境にはそもそも移行対象データがない）           |

**`avatars` の `public` は要注意**: 旧 baseline は `public = false` で作成し、後続の `20260401000000_fix_avatars_bucket_public.sql` が `true` へ変更している。production の現状は `public = true`。新 baseline は**現在の値**を書く。この種のドリフトこそ squash で潰したい対象であり、同時に写経ミスが最も起きやすい箇所でもある。

## 手順書ドラフト

実施 issue ではこの順序を踏み、各ステップの出力を PR に貼る。コマンドの正確なフラグは実施時点の CLI（当時の pin 版）で `--help` と公式リファレンスに再照合する。

### 1. 事前確認

```bash
git switch main && git pull
supabase migration list --linked   # ローカルと production の履歴が一致することを確認
gh pr list --state open            # migration を含む open PR がないことを確認
```

`cron.job` / `storage.buckets` / `vault.secrets` の現況を production で読み取り、後で復元すべき DML を確定する（read-only の supabase MCP で可）。

### 2. 新 baseline の生成

```bash
supabase db reset                                  # 既存 migration 全適用でローカルを最新状態に
supabase migration squash --version 00000000000000 # 出力先を baseline ファイルに固定
```

`--version` を省くと**最新のタイムスタンプのファイル**に書き込まれる。必ず明示する。

### 3. 非スキーマオブジェクトの手当て

生成された `00000000000000_baseline.sql` の末尾に、上表の storage bucket の `INSERT` を手書きで復元する。旧 baseline の該当ブロックを参照しつつ、**値は production の現状に合わせる**。cron / vault は復元しない。

### 4. 旧 migration の退避

```bash
git mv supabase/migrations/2026*.sql supabase/migrations/_archive/
```

`_archive/README.md` に第 2 回のレンジと日付を追記する。

### 5. ローカル検証

```bash
supabase db reset            # 新 baseline 単体でスキーマが構築できるか
pnpm types:generate:local    # 生成型に差分が出ないこと（差分ゼロが合格）
```

さらに、新 baseline から構築したローカルと production のスキーマ差分がゼロであることを確認する（`supabase db diff --linked` 等。フラグは実施時に確認）。**差分が出た場合は squash を中止し、原因を先に潰す。**

### 6. production の履歴を合わせる

PR merge により GitHub integration が migration を適用しようとする前に、production の履歴から退避済み 141 件を落とす。

```bash
supabase migration repair --status reverted <version>   # 退避した各 version に対して
```

`migration repair` は**追跡テーブルを書き換えるだけで SQL を適用も巻き戻しもしない**。実 DB のスキーマは squash 前後で不変なので、これは記録の整合を取る操作に過ぎない。`00000000000000` は applied のまま触らない。

### 7. 事後検証

```bash
supabase migration list --linked   # ローカル 1 件 / production 1 件で一致
```

適当な PR を 1 本開き、**新しい Preview branch が新 baseline から正常に作成される**ことを確認する。ここまで通って初めて完了とする。

## preview branch / 新規環境への影響

- **実施中の open PR**: 親の履歴が変わるため、squash 前に開いていた PR の Preview branch は不整合になる。実施ウィンドウ中は migration を含む PR を merge せず、既存 PR は squash 後に main を取り込んで Preview branch を作り直す
- **新規環境 / ローカル**: `supabase db reset` が新 baseline 1 ファイルからスキーマを構築する。適用ファイル数が 142 → 1 になり reset が速くなる（これが主な便益）
- **production**: スキーマ変更ゼロ。変わるのは `supabase_migrations.schema_migrations` の行数のみ
- **`_archive/`**: CLI は `supabase/migrations/` 直下の `*.sql` だけを適用するため、サブディレクトリに置いた退避分は適用対象外のまま

## リスクと可逆性

| リスク                                             | 影響                                        | 対応                                                        |
| -------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| squash 出力が production スキーマとずれる          | 新規環境だけ壊れ、production では気づけない | 手順 5 の差分ゼロ確認を通過ゲートにする。ずれたら中止       |
| storage bucket の写経ミス（特に `avatars.public`） | 新規環境でアバターが表示されない            | production の実測値を PR 本文に貼り、レビューで突き合わせる |
| `migration repair` の対象漏れ                      | production 履歴とローカルが不一致のまま     | 手順 7 の `migration list --linked` で一致を確認            |
| squash 直後に hotfix migration が必要になる        | 手順が輻輳する                              | 判定基準 3（リリース直後の静穏期）で回避                    |

**可逆性は `[hours]`**。roll-forward を基本とする。

- ファイル側: PR の revert で `_archive/` からの復帰と旧 baseline の復元が一度に戻る
- production 履歴側: `supabase migration repair --status applied <version>` で reverted にした 141 件を戻す
- **実 DB のスキーマは一切変更していない**ため、最悪ケースでも「履歴テーブルの記録がずれる」に留まり、ユーザーデータは影響を受けない。これが squash を比較的安全に実施できる根拠

## 実施 issue を切る時のチェックリスト

- [ ] 判定基準 3 条件を満たしていることを本文に記載する
- [ ] 実施時点の migration 件数と production 履歴の行数を再実測し、一致を確認する
- [ ] `cron.job` / `storage.buckets` / `vault.secrets` を再実測する（本書の値は 2026-07-23 時点。**実施時に必ず取り直す**）
- [ ] CLI の `migration squash` / `migration repair` のフラグを、実施時点の pin 版で公式リファレンスに再照合する
- [ ] `EXPLICIT AUTHORITY`（production の履歴書き換えを含む）としてユーザーの明示承認を得る
- [ ] `_archive/README.md` の更新を成果物に含める
- [ ] [#1462 migration failure recovery](https://github.com/Dayopt/dayopt/issues/1462) の復旧手順と矛盾しないか確認する

## Related Documents

- [decision: 次回 baseline squash の範囲・時点・タイミングを確定する](../../engineering/log/2026-07-23-migration-baseline-squash-plan.md)
- [`supabase/migrations/_archive/README.md`](../../../supabase/migrations/_archive/README.md) — 前回 squash の運用実績
- [`supabase/schemas/README.md`](../../../supabase/schemas/README.md) — squash 後もヘッダーを書き換えない方針
- [`docs/engineering/data/db/rls-snapshot.md`](../../engineering/data/db/rls-snapshot.md) — RLS の自動生成スナップショット
- 関連 issue: [#1523](https://github.com/Dayopt/dayopt/issues/1523)
