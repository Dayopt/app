---
status: active
last_verified: 2026-08-04
code: scripts/ci
---

# ci-monorepo-refactor — 影響範囲に応じて検証・build・release を実行する

モノレポの CI/CD が Product / Web を常に一組として扱っている状態を解消し、変更の影響を受ける app だけを検証・build・release する構成へ移行する。進捗と残作業は epic [#1812](https://github.com/Dayopt/dayopt/issues/1812) が正本で、本書は設計（なぜこの形か・判定仕様・Phase 構成・移行順序）の正本。**大規模判定**（blast radius が CI / merge gate / release 横断、Phase 5 構成）。

---

## 1. Goal

変更ファイルと workspace 依存グラフから影響範囲を**一度だけ**判定し、その結果を CI、merge gate、Vercel、Production Release で共有する。

## 2. 現状の問題（2026-08-04 検証済み）

- [ci.yml](../../../.github/workflows/ci.yml) の `Web Build & E2E` は paths フィルタを持たず、Web を触らない PR でも ready 後に必ず走る
- Web build は 3 重: Actions の `pnpm build:web` + Playwright webServer の `pnpm build && pnpm start:e2e`（[playwright.config.ts](../../../apps/web/playwright.config.ts) の CI 分岐）+ Vercel preview
- Vercel の Product / Web project は、各 app へ影響しない変更でも両方 deployment を作る
- [finish-branch.sh](../../../scripts/git/finish-branch.sh) は `REQUIRED_CONTEXTS=("Vercel – product" "Vercel – web")` を無条件に要求し、片方の deployment を skip すると merge できない
- [production-release.mjs](../../../scripts/production-release.mjs) は `RELEASE_PROJECTS` 両方の同一 SHA candidate を待つため、片方だけ変更した release でも両方の build が必要
- [integration.yml](../../../.github/workflows/integration.yml) は 28 行の手書き paths を持ち、影響判定の規則が workflow ごとに散らばっている
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
3. **Draft は軽く、Ready 後に重い検証を行う**（[workflow.md §2 段階 CI](../../../.claude/rules/workflow.md) の既存方針を維持）
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

- **docsOnly** — 変更ファイルの**全て**が docs 系パターン（`docs/**`、`.claude/**/*.md`、`AGENTS.md`、`CLAUDE.md`、`README.md`）に該当する時のみ true。[ci.yml](../../../.github/workflows/ci.yml) の paths-ignore と同一規則
- **product** — `apps/product/**`、`packages/**`（product は全 7 package に依存）、`supabase/**`、root 設定（`package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` / `turbo.json` / `tsconfig.base.json` / `.nvmrc`）のいずれかに触れた時 true
- **web** — `apps/web/**`、`packages/**` のうち web が依存するもの（`packages/domain` 以外）、root 設定に触れた時 true
- **integration** — [integration.yml](../../../.github/workflows/integration.yml) の現行 paths と同一集合（server contract / DB / migration / MCP / tRPC 境界）
- **productJourney** — `product` が true かつコード変更を含む時 true（E2E spec / config 自体の変更も含む）
- **webPreviewSmoke** — `web` と同値
- **未知の path は fail closed** — どの規則にも該当しないファイル（新しい root ファイル等）は「全て affected」として扱う。判定漏れが検証漏れに化けるのを防ぐ

依存グラフは pnpm workspace の manifest（`dependencies` / `devDependencies` の `@dayopt/*`）から実行時に解決する。ハードコードした対応表は持たない（package 追加時に判定が自動追従する）。

### consumer ごとの変更ファイル一覧の取り方

Resolver の規則は共有し、**入力の作り方だけが consumer で違う**。

| consumer                                                                                | 変更ファイル一覧                                                               | 判定不能時                    |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------- |
| merge gate（[finish-branch.sh](../../../scripts/git/finish-branch.sh)）                 | PR の files API（rename 元も含む。件数不一致は truncation として棄却）         | 両 project の context を必須  |
| Production Release（[production-release.mjs](../../../scripts/production-release.mjs)） | **project ごとに** `git diff --no-renames <その project の live SHA> <target>` | その project を affected 扱い |

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

Step 分割は作業単位、PR は機能のまとまり（[workflow.md §PR 粒度](../../../.claude/rules/workflow.md)）。

| PR  | 内容                                                                                                                  | 分割理由                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Phase 1（Impact Resolver + test + Step Summary）+ Phase 2（merge gate の affected-aware 化）+ マージルール gate（§7） | merge gate は resolver の最初の消費者。`finish-branch.sh` はローカル実行なので merge-base diff から impact をその場で再計算でき、CI artifact の受け渡しが不要 |
| B   | Phase 3（Production Release の affected-aware 化）                                                                    | production release 経路は独立して検証・revert したい変更                                                                                                      |
| C   | Phase 4（Vercel skip 有効化 + Config Audit への metadata 監査追加）                                                   | 外部設定変更が主体。B より先に出さない（§8）                                                                                                                  |
| D   | Phase 5（CI 重複整理: Actions の Web build 削除、Web E2E → Preview smoke 化）                                         | #1808 / #1809 の Local Supabase 基盤・journey 完成に依存                                                                                                      |
| E   | Phase 6（計測後に Unit を `turbo --affected` 化）                                                                     | 現行 full Unit の時間と検出内容を基準計測してから。現状 [turbo.json](../../../turbo.json) に `test:run` の inputs / 依存定義が無く、turbo.json 整備が前提     |

Phase 1 の Step Summary 表示は既存 static job 内の 1 step に相乗りさせる（job 新設は課金分 +1/run になるため）。

## 7. マージルール — レビュー thread の必須解決

`branch:finish` に「未解決 review thread 0 件」の gate を追加する。GraphQL の `reviewThreads` で `isResolved=false` を数え、1 件でもあれば merge を停止して一覧を表示する。

「解決」は次の 3 択のいずれか:

1. 指摘どおり fix を積んで resolve
2. 反論・根拠を reply して resolve
3. 別 issue へ切り出し、issue 番号を reply して resolve

外部レビュー（Codex）の的中率実績を踏まえ、黙殺での merge を機械的に塞ぐ。運用ルールの正本は [workflow.md](../../../.claude/rules/workflow.md) §マージ方式 に置く。

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

補足（2026-08-04 リスクレビューでの検出）: product の Vercel project は 2026-08-01 から標準機能の **Skip deployments（Root Directory 外の変更で skip）が Enabled** のまま（[当時のログ](../../engineering/log/2026-08-01-vercel-root-directory-flip-product.md)の残タスク未消化）。この機能は workspace 依存グラフを見ないため、`packages/**` のみの PR では Impact Resolver が `product=true` で context を要求する一方、Vercel は deployment を skip して context が付かず、**fail closed で merge が止まりうる**（安全側だが可用性の問題）。merge gate の affected-aware 化が main に入った後、最初の `packages/**` 限定 PR で `Vercel – product` context が付くかを確認し、付かなければ同トグルを Disabled に戻す。

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
