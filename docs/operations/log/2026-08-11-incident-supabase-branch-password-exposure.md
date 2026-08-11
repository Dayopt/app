---
status: frozen
date: 2026-08-11
last_verified: 2026-08-11
issue: 1461
---

# Supabase preview branch の credential が AI セッションの出力に露出した

2026-08-11、[#1461](https://github.com/Dayopt/dayopt/issues/1461) の Preview env 整備作業中に、Supabase preview branch の credential を取得する 2 つの経路で、値が AI セッションの出力へ平文で表示された。露出したのは作業用に新規作成した preview branch のものだけで、production の credential は含まない。該当 branch はいずれも削除済みで、露出した値は無効化されている。

同日、別セッション（[#1917](https://github.com/Dayopt/dayopt/issues/1917)）でも同型の露出（Turnstile secret）が起きている。単発の操作ミスではなく、出力の扱い方に共通の穴がある。

## 起きた事実

時系列（すべて 2026-08-11）:

1. `supabase --experimental branches create` で persistent preview branch を新規作成した（1 本目）。
2. `supabase --experimental branches get <branch-id>` を実行した。**この command は branch の credential を JSON で標準出力へ返す仕様**で、出力全体がセッションに表示された。露出したキーは `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_JWT_SECRET` / `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY` / `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING`（後 2 者は DB password を含む）。
3. 露出を検知し、以後の credential 取得をファイルへの直接 redirect に切り替えた。1Password への格納は値を表示しない経路で完了した。
4. ユーザー承認のもと 1 本目の branch を削除し、同一設定で 2 本目を作成した。
5. 2 本目の状態を確認するため Management API `GET /v1/branches/{id}` を呼び、応答を「secret らしいキー名を伏せる」フィルタ（denylist）に通して表示した。フィルタの判定語が `password` だったのに対し実際のキー名は `db_pass` だったため一致せず、**postgres superuser の password が平文で表示された**。
6. 指揮台の介入を受け、2 本目の branch も削除した。以後、出力は `jq` による allowlist 射影のみとする運用へ切り替えた。

範囲の確認:

- 露出した値はいずれも当日作成した preview branch のもので、production project (`yvglwblxrnrenfifsnje`) の credential は露出していない。
- branch は `--with-data` を付けずに作成したため、production データの複製を含まない。
- 値、断片、長さ、hash を repository / docs / GitHub Issue / PR へ転記していない。git 履歴への混入はない。
- Vercel の Production scope は作業前後で env 名 29 件が同一であることを metadata のみで確認した。値の変更も行っていない。
- 露出を起点とする不正利用の証拠は確認していない。

## 影響範囲

- 露出した credential は、削除した 2 本の preview branch（`efqkuihquhzhuhnwvffk` / `jczsntihetctcsrjwvth`）に対する DB / API アクセス権に限られる。branch 削除により無効化済み。
- production の DB / Auth / Storage、顧客データ、課金への影響はない。
- 出力先は private な AI セッションで、公開ログや外部サービスへは送っていない。

## 原因

直接の原因は 2 つとも「**出力の構造を確認する前に、その出力を表示した**」こと。

- 1 件目は、`branches get` が credential を返す command だと知らないまま実行した。
- 2 件目は、denylist 方式の伏字を書いたこと。未知のキー名が 1 つ増えるだけで破綻する構造で、実際 `db_pass` が漏れた。1 件目の直後にもかかわらず、同じ穴のある方法を再実装した点が本質的な失敗。

## 対応

- 露出した credential を含む preview branch 2 本を削除し、値を無効化した。persistent branch は削除前に `branches update --persistent=false` が必要。
- 1Password `Dayopt-Staging/supabase` の 3 field は 1 本目の branch の値を指したまま無効値になっている。preview branch の再作成時に更新する。
- #1461 の env 投入作業は、後述の migration 問題の解決まで再開しない。

## 学び / 再発防止

- **Management API / CLI の出力は必ず射影してから表示する。** 必要なキーだけを列挙する allowlist 方式とし、`*password*` / `*_pass` / `*_secret` / `*_key` / `*_token` を含むキーは射影対象から除外する。
- **応答全体や構造不明の出力を生で表示しない。** 構造が不明なときは先に `jq 'keys'` でキー一覧だけを確認し、そのうえで射影を決める。
- **伏字は denylist ではなく allowlist にする。** 「危なそうな名前を隠す」方式は、知らないキーが 1 つ増えるだけで破綻する。
- credential を返しうる command は、実行前に返り値の形を確認する。`supabase branches get` は credential 取得 command であり、状態確認には metadata のみを返す `branches list` を使う。
- 値をファイルへ書いた場合は、用が済んだ時点で削除する。

再発防止の実装（射影の必須化）は [#1920](https://github.com/Dayopt/dayopt/issues/1920) が所有する。

## 併発して判明した別の問題

封じ込めの過程で、作成した preview branch が 2 本とも `MIGRATIONS_FAILED` になることが判明した。242 個の migration のうち baseline と `20260317022728` の 2 つだけが適用され、`20260317040426_add_entry_time_overlap_constraint.sql` で停止していた。ローカルでの全 migration 再生（`pnpm db:reset`）は完走するため、branch 固有の失敗である。原因は本ログ作成時点で未特定。

これは #1461 の選択肢 α（常設 preview branch を Preview env の向き先にする）の前提を崩すため、env 投入より先に解決する必要がある。

## 関連

- GitHub Issue [#1461](https://github.com/Dayopt/dayopt/issues/1461)
- GitHub Issue [#1920](https://github.com/Dayopt/dayopt/issues/1920)
- [2026-07-22 Vercel CLI の一覧出力に認証 token が含まれた](./2026-07-22-incident-vercel-cli-token-output.md) — 同型（CLI 出力への値混入）
