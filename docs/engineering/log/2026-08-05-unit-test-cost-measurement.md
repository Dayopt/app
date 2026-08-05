---
title: Unit Tests の基準計測と、実行環境分割という結論
status: frozen
date: 2026-08-05
last_verified: 2026-08-05
---

# Unit Tests の基準計測と、実行環境分割という結論（#1816 Phase 6）

[#1816](https://github.com/Dayopt/dayopt/issues/1816) は着手条件に「基準計測の完了」を置いていた。
その計測の記録と、計測が plan を変えた経緯を残す。設計の正本は
[ci-monorepo-refactor/overview.md §Phase 6 実施形態](../../projects/ci-monorepo-refactor/overview.md)。

## 計測の前提: repo は現在 public

Actions API の `billable.UBUNTU.job_runs[].duration_ms` が全 run で `0` を返す。これは public repo の
署名で、**現時点の Actions 課金はゼロ**。9 月の private 化で初めてコストが発生する。

GitHub の standard hosted runner は **public が 4 core / 16GB、private が 2 core / 8GB**
（[公式](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)）。
vitest の worker 数は概ね `core - 1` なので、private 化で **3 worker → 1 worker** になる。
つまり今の数字をそのまま将来の見積もりに使えない。以下、「1 worker」条件での計測を併記する。

## 現状（2026-08-05 時点、public runner）

直近 15 run の Unit job は中央値 **200s**（≒3.3 分）。step 内訳の平均:

| step                            | 平均 |
| ------------------------------- | ---- |
| Product unit tests              | 131s |
| Production contracts 検証       | 18s  |
| setup                           | 18s  |
| Build packages                  | 10s  |
| Web / i18n / observability unit | 8s   |
| **合計**                        | 188s |

**Unit job の 70% が Product unit tests 1 step**。ここ以外を削っても意味が無い。

## なぜ遅かったか — テスト本体は全体の 5%

CI ログの vitest 内訳（308 files、job 全体が 420s だった run）:

| 項目                     | 時間      |
| ------------------------ | --------- |
| **tests**（テスト実行）  | **15.2s** |
| import（モジュール読込） | 123.0s    |
| environment（happy-dom） | 85.4s     |
| setup                    | 45.3s     |
| transform                | 5.5s      |

テストそのものは 5% で、残りは**ファイルごとの実行環境構築とモジュール読み込み**だった。
原因は [vitest.config.ts](../../../apps/product/vitest.config.ts) が
`environment: 'happy-dom'` を全 test に掛けていたこと。実際に DOM が要るファイルを数えると:

| 種別                    | 件数 | DOM  |
| ----------------------- | ---- | ---- |
| `.tsx`                  | 57   | 必要 |
| `.ts` で DOM API を参照 | 28   | 必要 |
| `.ts` で DOM 非依存     | 219  | 不要 |

**72% が happy-dom を無駄に払っていた。**

## A/B 実測（ローカル、`--maxWorkers=1` = private runner 相当）

| 構成                   | 全 304 files | 純ロジック 219 files |
| ---------------------- | ------------ | -------------------- |
| 現状（全部 happy-dom） | 121.4s       | 73.1s                |
| node / happy-dom 分割  | **89.5s**    | 43.4s                |
| 削減                   | **−27%**     | −41%                 |

分割後の `environment` は 28.9s → 9.0s、`setup` は 17.2s → 6.2s。
テスト件数（308 files / 3018 tests）は分割前後で一致しており、収集の取りこぼしは無い。

### ローカルの pass を分類の根拠にしてはいけない（2026-08-05 に踏んだ）

分割直後のローカル実行では失敗ファイル集合が分割前と完全に一致したため「取りこぼし無し」と
判断したが、**これは誤りだった**。CI（Node 24）では 2 ファイル 9 テストが
`ReferenceError: localStorage is not defined` で落ちた。

原因は 2 つ重なっている。

1. **Node 22 以降は `localStorage` をネイティブに持つ。** ローカルは Node 26 なので
   `environment: 'node'` でも web storage が使えてしまい、この失敗が完全に隠れる。
   **分類の oracle は CI であってローカルではない**
2. **DOM 依存は test ファイルを読んでも分からないことがある。**
   `calendarScrollStore.test.ts` は localStorage に一言も触れていないが、**実装側**の
   `calendarScrollStore.ts` が localStorage で永続化する。test の中身を grep する
   分類方式では原理的に拾えない

この 2 件は `DOM_ONLY_TESTS` へ移した。分類ミスは CI が 1 run で全件洗い出すので
（308 files 中どれが落ちるかが一度に分かる）、当て推量で広げるより CI に答えさせる方が速い。

## 却下: `isolate: false`

同条件で `--no-isolate` を測ると純ロジック 219 files が 12.5s → 4.1s（multi-worker）まで落ちるが、
**8 ファイル 28 テストが相互汚染で fail**した。汚染を直しても「今後どのテストも隣を壊しうる」
状態が恒久的に残る。速度のために静かな相互汚染の余地を作るのは
[plan-format.md](../../../.claude/rules/plan-format.md) の mandate（長期で負債を作らない）に反するため採らない。

## affected 化の効き

直近 60 PR の変更ファイルを Impact Resolver に通した結果:

| 判定                         | 件数                 |
| ---------------------------- | -------------------- |
| docs-only（既に全 job skip） | 2                    |
| `product=true`               | 39（残り 58 の 67%） |
| `product=false`（skip 可）   | 19（残り 58 の 33%） |

`product=false` の中身は CI / scripts / docs 周辺の PR。**この 33% は CI 工事が続いた時期の
バイアス**で、feature 開発が戻れば下がる。だから affected 化は「あれば効く」補助であって、
主レバーではない。主レバーは無条件に効く環境分割の方。

## 結論

1. **vitest を `unit`（node）/ `unit-dom`（happy-dom）に分割**する — 無条件に −27%
2. **Unit job の Product unit tests step を Impact Resolver で skip 可能にする** — `product=false` の PR で
   さらに 131s（private 換算で 313s）が消える
3. `turbo --affected` は採らない — 影響判定が二重になり、
   [overview.md §4 原則 1](../../projects/ci-monorepo-refactor/overview.md) に自ら反する

## CI 実測（PR #1840、2026-08-05）

ローカル 1 worker の予測 −27% に対し、**CI 実測は −26%** でほぼ一致した。

| 対象                    | 変更前（直近 15 run 中央値） | 変更後                | 差       |
| ----------------------- | ---------------------------- | --------------------- | -------- |
| Unit job 合計           | 208s（課金 4 分）            | **154s（課金 3 分）** | **−26%** |
| Product unit tests step | 131s                         | **99s**               | −24%     |

変更後の step 内訳（154s）: Product unit tests 99s / contracts 18s / setup 14s /
build:packages 10s / web + i18n + observability 8s。

private 化後は core 半減で概ね倍になるため、**Unit は push あたり 7 分 → 5 分**の見込み。

## 未確認

- private 化後の実数値は 9 月まで測れない。上の見積もりは
  「core 数から worker 数が半減する」という推論に基づく
- **`productUnit=false` で実際に skip される経路は未検証。** PR #1840 は
  `apps/product/**` を触るため `productUnit=true` になり、skip 側を通らない。
  `apps/product/**` を触らない次の PR が検証台になる
