---
status: done
last_verified: 2026-08-05
code: scripts/ci
---

# ci-monorepo-refactor — 影響範囲に応じて検証・build・release を実行する

モノレポの CI/CD が Product / Web を常に一組として扱っている状態を解消し、変更の影響を受ける app だけを検証・build・release する構成へ移行する。進捗と残作業は epic [#1812](https://github.com/Dayopt/dayopt/issues/1812) が正本で、本書は設計（なぜこの形か・判定仕様・Phase 構成・移行順序）の正本。**大規模判定**（blast radius が CI / merge gate / release 横断、Phase 5 構成）。

---

## 1. Goal

変更ファイルと workspace 依存グラフから影響範囲を**一度だけ**判定し、その結果を CI、merge gate、Vercel、Production Release で共有する。

## 2. 現状の問題（2026-08-04 検証済み）

- [ci.yml(../../../../.github/workflows/ci.yml) の `Web Build & E2E` は paths フィルタを持たず、Web を触らない PR でも ready 後に必ず走る
- Web build は 3 重: Actions の `pnpm build:web` + Playwright webServer の `pnpm build && pnpm start:e2e`（[playwright.config.ts(../../../../apps/web/playwright.config.ts) の CI 分岐）+ Vercel preview
- Vercel の Product / Web project は、各 app へ影響しない変更でも両方 deployment を作る
- [finish-branch.sh(../../../../scripts/git/finish-branch.sh) は `REQUIRED_CONTEXTS=("Vercel – product" "Vercel – web")` を無条件に要求し、片方の deployment を skip すると merge できない
- [production-release.mjs(../../../../scripts/production-release.mjs) は `RELEASE_PROJECTS` 両方の同一 SHA candidate を待つため、片方だけ変更した release でも両方の build が必要
- [integration.yml(../../../../.github/workflows/integration.yml) は 28 行の手書き paths を持ち、影響判定の規則が workflow ごとに散らばっている
- Product E2E は認証・service role が必要な重要 spec を CI で skip している（#1808）。中核 journey の未完成分は #1809

## 3. 期待する挙動

| 変更                       | Product               | Web                   | Production       |
| -------------------------- | --------------------- | --------------------- | ---------------- |
| `apps/product/**` のみ     | verify / build        | skip                  | Product のみ更新 |
| `apps/web/**` のみ         | skip                  | build / preview smoke | Web のみ更新     |
| Web/Product 共通 package   | 両方                  | 両方                  | 両方更新         |
| docs / agent Markdown のみ | skip                  | skip                  | no-op            |
| DB / server contract       | integration + Product | skip                  | Product のみ更新 |

## 4. 設計原則

1. **影響判定を一か所に集約する。** `scripts/ci/impact.mjs` を正本とし、GitHub Actions の手書き paths、Vercel の skip、merge gate、release が別々の規則を持たない
2. **Vercel の skip は最適化であり、正しさの基準にはしない。** Dayopt 側で `web=true` なのに `Vercel – web` が無い場合は fail closed。`web=false` なら Web context が無くても正常
3. **Draft は軽く、Ready 後に重い検証を行う**（[workflow.md §2 段階 CI(../../../../.claude/rules/workflow.md) の既存方針を維持）
4. **build は配信環境で一度だけ行う。** Product / Web の本番相当 build は Vercel を正とし、Actions 内の重複 build を撤去する
5. **E2E は存在確認ではなく中核 journey を守る。** Product は Local Supabase で実データ操作、Web は Vercel Preview URL で最小 smoke。重要 spec の skip を green として扱わない
6. **DB migration は artifact rollback と分離する。** expand / contract で後方互換期間を確保する

## 5. Impact Resolver の判定仕様

出力（JSON、キーは固定）:

```json
{
  "product": true,
  "web": false,
  "integration": true,
  "productJourney": true,
  "webPreviewSmoke": false,
  "docsOnly": false
}
```

判定規則:

- **docsOnly** — 変更ファイルの**全て**が docs 系パターン（`docs/**`、`.claude/**/*.md`、`AGENTS.md`、`CLAUDE.md`、`README.md`）に該当する時のみ true。[ci.yml(../../../../.github/workflows/ci.yml) の paths-ignore と同一規則
- **product** — `apps/product/**`、`packages/**`（product は全 7 package に依存）、`supabase/**`、root 設定（`package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` / `turbo.json` / `tsconfig.base.json` / `.nvmrc`）のいずれかに触れた時 true
- **web** — `apps/web/**`、`packages/**` のうち web が依存するもの（`packages/domain` 以外）、root 設定に触れた時 true
- **integration** — [integration.yml(../../../../.github/workflows/integration.yml) の現行 paths と同一集合（server contract / DB / migration / MCP / tRPC 境界）
- **productJourney** — `product` が true かつコード変更を含む時 true（E2E spec / config 自体の変更も含む）
- **webPreviewSmoke** — `web` と同値
- **未知の path は fail closed** — どの規則にも該当しないファイル（新しい root ファイル等）は「全て affected」として扱う。判定漏れが検証漏れに化けるのを防ぐ

依存グラフは pnpm workspace の manifest（`dependencies` / `devDependencies` の `@dayopt/*`）から実行時に解決する。ハードコードした対応表は持たない（package 追加時に判定が自動追従する）。

### consumer ごとの変更ファイル一覧の取り方

Resolver の規則は共有し、**入力の作り方だけが consumer で違う**。

| consumer                                                                                  | 変更ファイル一覧                                                               | 判定不能時                    |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------- |
| merge gate（[finish-branch.sh(../../../../scripts/git/finish-branch.sh)）                 | PR の files API（rename 元も含む。件数不一致は truncation として棄却）         | 両 project の context を必須  |
| Production Release（[production-release.mjs(../../../../scripts/production-release.mjs)） | **project ごとに** `git diff --no-renames <その project の live SHA> <target>` | その project を affected 扱い |

release の基準が project ごとに違うのが要点。web が 3 commit 遅れた状態で product だけ進んでいれば、web の判定は「web が今配信している SHA から target まで」で行う。merge 単位で判定すると、前の run で取りこぼした変更が二度と release されない。

`git diff` が空（0 件）で正常終了したのは「差分なし」の確定的な答えなので unaffected とする。一覧が取れなかった場合（shallow clone、gc 済み、source SHA 不明）とは区別する。前者は skip してよく、後者は fail closed。

### Production Release の状態

| status             | 意味                                          | commit status |
| ------------------ | --------------------------------------------- | ------------- |
| `promoted`         | affected な project を promote した           | success       |
| `already-released` | 全 project が既に target を配信している       | success       |
| `unaffected`       | どの app にも影響しない merge（promote 0 件） | success       |
| `superseded`       | より新しい deployment が既に live             | failure       |
| `failed`           | gate 失敗 / rollback 実施                     | failure       |

`unaffected` を success にするのは、production の artifact がその commit と等価だから（docs / CI 設定の merge に tag を打てなくする理由が無い）。`superseded` との違いは「production が古いままか、新しくなっているか」ではなく「**この commit の内容が live か**」で決まる。

promote 後は `dayopt.app` と `app.dayopt.app` の**両方**を smoke する。片側だけ進んだ production はその組み合わせが初めて世に出る状態で、cross-app の破損は candidate 単体の smoke では出ない。この smoke は bypass secret を送らず、production domain 側の Deployment Protection 設定事故も同時に見る。rollback 対象は **この run が promote した project だけ**とする。

## 6. Phase 構成と PR の対応

Step 分割は作業単位、PR は機能のまとまり（[workflow.md §PR 粒度(../../../../.claude/rules/workflow.md)）。

| PR  | 内容                                                                                                                  | 分割理由                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Phase 1（Impact Resolver + test + Step Summary）+ Phase 2（merge gate の affected-aware 化）+ マージルール gate（§7） | merge gate は resolver の最初の消費者。`finish-branch.sh` はローカル実行なので merge-base diff から impact をその場で再計算でき、CI artifact の受け渡しが不要 |
| B   | Phase 3（Production Release の affected-aware 化）                                                                    | production release 経路は独立して検証・revert したい変更                                                                                                      |
| C   | Phase 4（Vercel skip 有効化 + Config Audit への metadata 監査追加）                                                   | 外部設定変更が主体。B より先に出さない（§8）                                                                                                                  |
| D   | Phase 5（CI 重複整理: Actions の Web build 削除、Web E2E → Preview smoke 化）                                         | #1808 / #1809 の Local Supabase 基盤・journey 完成に依存                                                                                                      |
| E   | Phase 6（Unit の実行環境分割 + Impact Resolver での skip）                                                            | 基準計測の結果 `turbo --affected` は採らなかった（§Phase 6 実施形態）                                                                                         |

Phase 1 の Step Summary 表示は既存 static job 内の 1 step に相乗りさせる（job 新設は課金分 +1/run になるため）。

## 7. マージルール — レビュー thread の必須解決

`branch:finish` に「未解決 review thread 0 件」の gate を追加する。GraphQL の `reviewThreads` で `isResolved=false` を数え、1 件でもあれば merge を停止して一覧を表示する。

「解決」は次の 3 択のいずれか:

1. 指摘どおり fix を積んで resolve
2. 反論・根拠を reply して resolve
3. 別 issue へ切り出し、issue 番号を reply して resolve

外部レビュー（Codex）の的中率実績を踏まえ、黙殺での merge を機械的に塞ぐ。運用ルールの正本は [workflow.md(../../../../.claude/rules/workflow.md) §マージ方式 に置く。

## 8. 移行順序（安全制約）

**`branch:finish` と Production Release を affected-aware にする前に、Vercel の Skip deployment を有効化しない。** 現在は両 Vercel context と同一 SHA の両 candidate を要求しているため、先に skip すると merge / release が停止する。

```text
Impact Resolver → merge gate 対応 → Production Release 対応 → Vercel skip 有効化 → CI / E2E 整理
```

### Phase 4 への制約: skip の基準は「その project の live SHA」でなければならない

Phase 3 の release は影響を **live SHA からの累積** で測る。merge 単位で測ると、失敗した release の変更が二度と拾われなくなるため（§5）。この性質が Vercel の skip 判定に条件を課す。

例: commit A が product を変え、その release run が失敗する。次の commit B は web だけを変える。product の live SHA は A より前なので、B の release で product は正しく affected になる。ところが Vercel の skip が **merge 単位**（B の diff に product が無い）で判断すると、**SHA B の product deployment が存在しない**。release は B の product candidate を 25 分待って timeout し、B 以降の release が全て止まる。

したがって Phase 4（#1817）の Ignored Build Step は、**その project の最後の production deployment の SHA を基準に diff を取る**必要がある（`turbo-ignore` の既定に近い挙動）。merge の親との diff で判断してはならない。この一致は #1817 の受け入れ条件とする。

なお現状（skip 未有効）ではこの問題は起きない。Vercel が毎 merge で全 project を build するため、target SHA の candidate は常に存在する。timeout は fail closed（未検証の build を出さない）なので安全性の問題ではなく、可用性の問題。

補足（2026-08-04 リスクレビューでの検出）: product の Vercel project は 2026-08-01 から標準機能の **Skip deployments（Root Directory 外の変更で skip）が Enabled** のまま（[当時のログ(../../../engineering/log/2026-08-01-vercel-root-directory-flip-product.md)の残タスク未消化）。この機能は workspace 依存グラフを見ないため、`packages/**` のみの PR では Impact Resolver が `product=true` で context を要求する一方、Vercel は deployment を skip して context が付かず、**fail closed で merge が止まりうる**（安全側だが可用性の問題）。merge gate の affected-aware 化が main に入った後、最初の `packages/**` 限定 PR で `Vercel – product` context が付くかを確認し、付かなければ同トグルを Disabled に戻す。

### Phase 4 実施形態（2026-08-05）

skip の対象は **preview build（PR の push）だけ**とし、production build は skip しない。上の制約（「その project の live SHA を基準に diff を取る」）は、production では「skip しなければ破りようがない」形で満たす。

- **`turbo-ignore` は不採用。** Vercel 公式の `turbo-ignore` パッケージは turbo の task graph から affected package を判定する専用 CLI だが、判定規則を `scripts/ci/impact.mjs`（本書 §1 の設計原則「影響判定を一か所に集約する」）の外に持つことになり、CI の手書き paths・merge gate・Production Release と三重管理になる。加えて `turbo-ignore` は 2025 年に Vercel の deprecation 対象になっている。代わりに `apps/{product,web}/vercel.json` の `ignoreCommand` から `node ../../scripts/ci/impact.mjs --vercel <product|web>` を直接呼び、既存の Impact Resolver をそのまま再利用する
- **production build（`VERCEL_ENV=production`）は変更内容によらず skip しない。** 基準に使える `VERCEL_GIT_PREVIOUS_SHA` は「その project + branch の直前の**成功した build**」であって live に promote された SHA ではない。Auto-assign 無効化後は「candidate の build は成功したが release が smoke / audit で失敗し未 promote」が正常に起こりうるため、それを基準に skip すると次の merge で Production Release（live SHA 基準で affected 判定）が存在しない candidate を `WORST_CASE_RELEASE_MS` まで待ち続けて詰まる（PR #1835 の Codex P1 指摘）。live SHA を ignoreCommand から取得するには `VERCEL_TOKEN` の build env 配布が要り secrets 方針に反するため採らず、production を常時 build する（従来と同じ、merge あたり最大 2 build）。課金削減は push 回数の多い preview 側で得る
- **preview build の基準 SHA は `VERCEL_GIT_PREVIOUS_SHA` を使う。** 「その project + branch の直前の成功 deployment の SHA」で、Ignored Build Step 設定時のみ build container に露出する。preview は release gate と無関係なので「成功 build 基準」で十分（最終 push だけ unaffected の場合の merge gate 側の扱いは infra.md §merge gate を参照）
- **fail open を徹底する。** exit 1 = build 続行、exit 0 = build skip という Vercel の契約に対し、env 欠落・shallow clone（`git clone --depth=10`）で SHA が履歴に無い・git 失敗・resolver 判定不能はすべて exit 1（build）に倒す。skip は「diff が取れて Impact Resolver が明確に false を返した」場合のみ
- **product の「Skip deployments (no changes to root directory)」（`enableAffectedProjectsDeployments`）は merge より前に Disabled へ戻す。** 順序が必須なのは、この PR が audit contract 保護対象を変更するため merge に trusted dispatch（branch code で project 設定監査あり）の success が要り、Enabled のままだと dispatch が audit failure で落ちて merge できないため。先に Disabled へ戻しても現 main には ignoreCommand が無いので、影響は「全 push で build される = 従来どおりの課金」だけで安全。§8 補足で検出済みの残タスク（2026-08-01 から Enabled のまま）をこの手順で解消する。この機能を有効なままにすると、workspace 依存グラフを見ない自動 skip が `ignoreCommand`（依存グラフを見る）と二重に判定することになり、どちらが実際に skip を決めたか切り分けられなくなる。`scripts/production-config-audit.mjs` の project 設定監査が定常状態でこのフィールドを `false` に固定し、再度 Enabled に戻る drift を検出する

### Phase 5 実施形態（2026-08-05）

`#1815` は「Actions の Web build 削除」「Web E2E を Vercel Preview URL への smoke へ」「integration.yml の paths を Impact Resolver へ集約」と書いていたが、**前 2 つは形を変え、3 つ目は採らなかった**。原則（§4-4「build は配信環境で一度だけ」）は維持したまま、達成手段を安いものに置き換えている。

判断の骨子は 3 つ。

- **Actions の web build は「削除」ではなく「web に影響しない PR で job ごと skip」で足りた。** gate job が web 系のキーを出力しておらず、`web` job の `if:` は `docs_only` しか見ていなかった。つまり product だけを触る PR でも Actions が web を build し直していた（§3 の期待挙動「Web を触らない PR で Web は skip」の未達部分）。gate の output を `if:` に配ると、Vercel の preview build と重複する build は web 影響時だけになる。判定不能は実行側へ倒す（fail closed）
- **判定キーは `web` ではなく `webCi` を新設した。** push 前の反証レビュー（behavior-verifier）が、Phase 6 の `productUnit` と同型の穴を指摘した: `web` job も `.github/actions/setup/action.yml`（Node / pnpm のバージョン）で動くため、**toolchain を上げる PR で `web=false` になると、その新しい runtime で Actions 上の web build と E2E を一度も走らせないまま merge**できる。かといって `web=true` に倒すと、この file は Vercel の build env に影響しないのに `Vercel – web` context を要求し、Phase 4 で止めた preview build が復活する。`product` / `productUnit` とまったく同じ非対称なので、同じ形で分けた（`webCi = web || ciToolchain`）
- **Web E2E の Vercel Preview smoke 化は採らなかった。** ci.yml には `VERCEL_TOKEN` が無く、この repo は「`VERCEL_TOKEN` を使う workflow は PR のコードを実行しない」を一貫して守っている（`production-config-audit.yml` は `pull_request_target` で base revision のみ、`release.yml` は `push:main` / `workflow_dispatch`）。`web` job は PR ブランチのコードをそのまま実行するため、ここに token を配ると **その一貫性を初めて破る**。さらに Preview は Deployment Protection が有効で bypass secret の新規配布が要り、URL の決定的構築は Vercel 内部仕様（branch 名の slug 化・長さ制限・衝突時 hash）に依存して repo に前例が無い。得られるものは「Actions 上の web build を 1 回減らす」だけで、それは上の skip 配線で既に得られている。**原則の目的（重複 build の撤去）は達成し、手段だけを安全側に留める**
- **`integration.yml` の手書き paths は Impact Resolver へ集約しなかった。** Actions は trigger の `paths:` を job 起動前に評価するため、判定を resolver へ寄せるには「workflow を常時起動して gate job で判定する」形しか取れない。gate job は課金が job 単位で切り上がるので **1 課金分/push が新規発生**し、課金削減という Phase 5 の目的に逆行する。一方で drift は実測ゼロ（22 件が byte 一致）で、防ぎたいのは将来の片側編集だけだった。そこで `scripts/__tests__/impact.test.ts` の contract test で同期を強制する形にした（順序差・件数差・1 文字差のいずれでも落ちることを実際に壊して確認済み）。§4 設計原則 1 の趣旨は「判定ロジックが分岐しないこと」であり、test が同期を保証すれば満たされる

`#1815` の残り 4 項目は次のとおり決着した。**Local Supabase 基盤の共有**と **critical journey の skip 解消**は #1808 で達成済み（e2e job に `supabase start` が入り、env 起因の skip は 0 になった）。**journey の merge gate 化**は追加実装が不要だった — journey は `🎭 E2E Tests` job で走り、この job は ruleset の required checks に入っているため、#1808 で CI 実行されるようになった時点で自動的に merge gate になっている。**Web smoke の絞り込み**は法務契約検査の移設（下記）で達成する。

したがって `productJourney` / `webPreviewSmoke` の 2 キーは**消費者が現れないまま残る**。§5 で「Phase 5 で E2E の実行判定に使う独立キーとして先に固定しておく」と書いたが、その Phase 5 が両方とも別の形で決着したため、現状は `formatSummary` の表示にしか使われていない。消さずに残すのは、消費側 contract を後から変えないという当初の意図がそのまま生きているため（将来 Preview smoke を再検討する時にキーの再設計から始めずに済む）。**次に触る人がこの経緯を知らずに「未配線のキー」を配線しないよう、この判断を根拠として残す。**

### Phase 6 実施形態（2026-08-05）

`#1816` は「turbo.json に `test:run` の inputs を定義して `turbo --affected` 化」と書いていたが、**基準計測の結果この案は採らなかった**。計測の詳細は [2026-08-05 のログ(../../../engineering/log/2026-08-05-unit-test-cost-measurement.md)。

判断の骨子は 2 つ。

- **Unit の重さは「対象範囲」ではなく「1 ファイルあたりの実行環境コスト」だった。** CI 実測（308 files）で `tests` は 15.2s、対して `environment` 85.4s / `import` 123.0s / `setup` 45.3s。テスト本体は全体の 5% しかない。原因は [vitest.config.ts(../../../../apps/product/vitest.config.ts) が全 test に `happy-dom` を掛けていたことで、実際に DOM が要るのは約 1/4 だけだった。**既定を `node` にして DOM が要るものだけ opt-in する** 分割が、affected 化とは独立に、かつ無条件に効く（実測 −27%）
- **affected 化に turbo は要らない。** CI の `gate` job は既に `scripts/ci/impact.mjs` を実行している。`turbo --affected` を足すと影響判定の仕組みが 2 つになり、§4 設計原則 1「影響判定を一か所に集約する」に自ら反する。gate job の output に `product` を足し、Unit job の該当 step を `if:` で落とす形にした

`turbo.json` は触っていない。Remote Cache も採用していない（維持コストを上回る便益が計測で出なかった）。

**判定キーは `product` ではなく `productUnit` を新設した。** push 前の反証レビュー（behavior-verifier）が、`.github/` を丸ごと中立扱いする `isNeutralPath` のせいで **`.github/actions/setup/action.yml` だけを変えた PR で product の unit test が skip される**穴を指摘した。この file は Node / pnpm のバージョン、つまり **Actions 上で product の test が動く runtime そのもの**を決めるので、skip すると「runtime を変えたのにその runtime で一度も test を走らせずに merge」になる（実際に `chore(node): ランタイムをNode.js 24へ統一` という commit が存在する）。

ただしこれを `product=true` に倒すのは誤り。この file は Vercel の build env には影響しないため、merge gate が `Vercel – product` context を要求し、Phase 4 で止めた preview build が復活する。**「CI で test を走らせるか」と「Vercel で build するか」は別の問い**なので、`productJourney` / `webPreviewSmoke` と同じく consumer ごとの独立キーに分けた。

`.github/workflows/ci.yml` は**あえて含めない**。ci.yml を変えた PR ではその新しい ci.yml 自体が実行されるため、gate 判定・job 構成・無条件 step は検証される。検証されずに残るのは skip された step の中身だけで、それを拾うために `product=false` な PR の 1/3（実測 19 件中 7 件）で skip を諦めるのは割に合わない。

なお `pnpm test:scripts`（root の CI / release / script contract test）は **product の affected 判定によらず常時実行する**。`product=false` になるのは `scripts/**` や `.github/**` を触った時なので、そこを skip すると変更した当の検証が走らない。

## 9. 非目標

- CI をすべて 1 workflow へ統合すること
- Vercel Preview で Production DB を使った変更系 E2E を行うこと
- すべての Unit / Static を即座に affected 化すること
- migration をアプリの Instant Rollback で戻せるようにすること
- Vercel の判定だけを信頼して merge / release を決めること

## 10. 関連

- epic: #1812（進捗の正本）
- #1808 — CI に Local Supabase を立てて認証必須 E2E を実行する
- #1809 — critical-path journey の残り 2 段を完成させる
