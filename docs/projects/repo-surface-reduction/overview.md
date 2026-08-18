---
status: active
last_verified: 2026-08-19
code:
  - package.json
  - docs
  - supabase/migrations
  - apps/product/src
  - packages
---

# repo-surface-reduction — surface 縮小の baseline 実測（slice A）

[epic #2165](https://github.com/Dayopt/dayopt/issues/2165) の撤退判定材料として、repo の 4 層（root scripts / workspace packages / current docs / test・story）の削減見込みを実測する。本 slice（[#2166](https://github.com/Dayopt/dayopt/issues/2166)）は**コードを変更しない**。成果物はこの doc のみ。

## この doc の使い方

**数値そのものではなく、数え方（コマンド）を正本にする。** 各層の見出しに実行コマンドを併記した。次回この epic に戻る時、または月次ガーデニングで再計測する時は、このコマンドを再実行して前回値と突き合わせる。数値を過去 issue から転記しない（#2100 → #2165 → 本 issue で 3〜6 週おきに乖離が発生している症状そのものが、この運用が必要な理由）。

**実測日は 2026-08-19、main `92bbdc4` 時点。** #2162（タグ 3 構造置換）の sub-issue が同時稼働中のため、この数値は着手から日をおかず陳腐化する前提で読む。

---

## 1. root scripts（101 → 102）

### 数え方

```bash
node -e "console.log(Object.keys(require('./package.json').scripts).length)"
```

101（issue起票時点）→ **102**（実測時点）。#2178 対応（本 epic とは無関係な tooling PR）でも script 名の追加削除は無かったため、この +1 のずれは起票後に別の変更で 1 本増えたことを示す。

### 分類方法

4 分類（`public` / `internal` / `alias` / `未参照`）を機械判定する:

1. **外部参照数**: `.github/workflows/**` / `docs/**` / `CLAUDE.md` / `.claude/**` / 各 `package.json` / `.husky/**` を対象に、`pnpm [run] [--filter X] <script名>` パターンを grep（word boundary 付き）で数える
2. **内部参照数**: root `package.json` の他 script の値（右辺コマンド文字列）に `pnpm <script名>` が現れるか
3. **alias**: 右辺コマンド文字列が別 script と完全一致するか
4. 上記いずれもゼロなら `未参照`

判定優先順位: `alias` > 外部参照 > 内部参照 > `未参照`。

再実行用スクリプトは使い捨てのため保存していない（bash の `for` ループが worktree-isolated セッションで実行を拒否されるため、次回は Node script で書き直すのが早い。本 doc に判定ロジックの疑似コードを残す方が再現性が高い）。

### 結果

| 分類                                                                                       |        件数 | 内訳                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------ | ----------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `public`（docs/CI/CLAUDE.md 等から参照される、または内部参照ありでも同時に外部参照がある） |          83 | —                                                                                                                                                                                                                              |
| `internal`（外部参照ゼロ・root script 間参照のみ）                                         |           0 | 内部限定の script は現状すべて同時に外部（docs 等）からも参照されており、"internal のみ" のケースは存在しない                                                                                                                  |
| `alias`（右辺完全一致）                                                                    | 6（3 ペア） | `build` / `build:product`（`pnpm --filter @dayopt/product build`）、`start` / `start:product`（`pnpm --filter @dayopt/product start`）、`test` / `test:product`（`pnpm --filter @dayopt/product test`）                        |
| `未参照`（外部参照・内部参照ともにゼロ）                                                   |          13 | `dev:product` / `dev:op` / `lint:product` / `lint:boundaries:update` / `typecheck:product` / `typecheck:packages` / `prepare` / `migration:list` / `migration:status` / `auth-email:sync` / `format` / `dev:web` / `start:web` |

**`未参照` 13 件のうち 1 件は false positive**: `prepare` は npm/pnpm のライフサイクルフック（`pnpm install` 時に自動起動）で、`pnpm prepare` と明示的に打鍵されることは無い。これは削減候補ではない。残り 12 件が真の候補。

**削減見込み**: `alias` 3 件（ペアのどちらか片方を残せば良い）+ `未参照` 12 件（`prepare` 除く）= **15 / 102 ≈ 14.7%**

---

## 2. workspace packages（7）

### 数え方

```bash
grep -rl "@dayopt/<package名>" apps packages --include="*.ts" --include="*.tsx" | grep -v "packages/<package名>/" | wc -l
```

foundations のみ CSS / Tailwind 設定からの参照も追加で数える（`--include="*.css" --include="*.mjs" --include="*.json"`）。

### 結果

| package                                    | consumer ファイル数 |
| ------------------------------------------ | ------------------: |
| `@dayopt/components`                       |                 220 |
| `@dayopt/i18n`                             |                  71 |
| `@dayopt/config`                           |                  59 |
| `@dayopt/observability`                    |                  28 |
| `@dayopt/domain`                           |                  16 |
| `@dayopt/foundations`（CSS/Tailwind 込み） |                  17 |
| `@dayopt/billing`                          |                  10 |

**削減見込み**: 全 7 package が 10 件以上の consumer を持ち、zero-use package は存在しない。**0 / 7 = 0%**。

---

## 3. current docs（65、`log/` `_archive/` 除く）

### 数え方

```bash
find docs -type f \( -name "*.md" -o -name "*.mdx" \) | grep -v "/log/" | grep -v "/_archive/" | wc -l
```

### 重複調査（サンプル、網羅ではない）

65 ファイル全文の突き合わせは本 slice の時間内では実施していない。**既知の候補 2 件を grep で確認したのみ**:

| 候補                                                                      | 出現ファイル数 | ファイル                                                                                                                                                         |
| ------------------------------------------------------------------------- | -------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| audit contract 保護対象ファイルリスト（`production-config-audit.mjs` 等） |              5 | `docs/operations/secrets.md` / `docs/operations/contact-email.md` / `docs/engineering/infra.md` / `.claude/rules/orchestration.md` / `.claude/rules/workflow.md` |
| 2 段階 CI（draft → ready 化）の説明                                       |              3 | `docs/engineering/infra.md` / `.claude/rules/orchestration.md` / `.claude/rules/workflow.md`                                                                     |

`.claude/rules/` 側は正本として意図的に参照されるべきものなので、**重複として数えるべきは docs 側が rules の内容を独自に再説明している箇所**。上記 2 件はどちらも docs 側 1〜2 ファイルが rules の記述を要約し直している形で、リンクで済ませられる可能性がある。

**削減見込みは未確定**（サンプル 2 件のみでは 65 ファイル全体の比率を主張できない）。**この層は本 slice では 4 層判定に使える精度のデータを持たない**と明記する。

---

## 4. test / story

### 数え方

```bash
# test file 総数
find apps packages scripts -type f \( -name "*.test.ts" -o -name "*.test.tsx" \) | grep -v node_modules | wc -l
# story file 総数
find apps packages -type f -name "*.stories.tsx" | grep -v node_modules | wc -l
# integration test（DB invariant 相当）
find apps packages -type f -name "*.integration.test.ts" | grep -v node_modules | wc -l
```

### 結果

| 指標                             | 実測値 | issue起票時 |
| -------------------------------- | -----: | ----------: |
| test file 総数                   |    465 |         450 |
| story file 総数                  |    165 |         170 |
| integration test（DB invariant） |     38 |           — |

**5 分類（DB invariant / command semantics / adapter translation / UI behavior / 実装詳細の固定）は本 slice では完了していない。** 465 ファイルを個別に読んで意図分類するのは本 slice の時間内で終わらない規模で、質的判断（境界の取り方で 10% を跨ぐ、と issue 本文も指摘している）を機械的 grep だけで代替すると誤判定リスクが高い。

代わりに次の粗い proxy を実測した:

- **DB invariant 相当（高確度）**: integration test 38 件（`*.integration.test.ts`。ファイル名で機械判別できる唯一のカテゴリ）= 465 件中 **8.2%**
- **実装詳細の固定 candidate（低確度 proxy）**: `toMatchSnapshot` または `toHaveBeenCalledWith` を含む apps/product/src 配下 test = 386 件中 141 件（**36.5%**）。**ただし `toHaveBeenCalledWith` は正当な command semantics 検証（「このサービスがこの引数で呼ばれたこと」を確認する契約テスト）にも広く使われるため、この 141 件を丸ごと「削除候補」とは扱えない。** 個別確認が必要な母集団の上限を示す数字として記録する

story の「live consumer の有無」分類も未実施（story ↔ component の対応付けと consumer 実測を 165 件分行う必要があり、本 slice の scope 外）。

**削減見込みは未確定**。integration test の 8.2% は高確度だが「削減対象」ではなく「保持すべき DB invariant」を識別しただけなので、そのままでは reduction 見込みにならない。**この層も本 slice では 4 層判定に使える精度のデータを持たない**。

---

## 5. dead code の現状（4 層判定には含めない）

### 数え方

```bash
pnpm quality:deadcode:ci   # CI 配線（knip --exclude files,unlisted,binaries）
pnpm quality:deadcode      # 非CI版（除外なし）
```

### 結果

- `quality:deadcode:ci`（CI 配線）: **0 件**（`files` / `unlisted` / `binaries` を除外した設定のため、未使用ファイル検出そのものが対象外）
- `quality:deadcode`（非CI、除外なし）: **1 件** — `apps/product/src/lib/test/integration-setup.ts`（knip が unused file candidate として報告。vitest の `setupFiles` からの参照を knip プラグインが検出できていない可能性があり、real dead code か plugin blind spot かは本 slice では未検証）

**この 0 件 / 1 件という数字は「dead code が無い」ことの根拠にならない。** issue 本文が指摘する 3 つの盲点がそのまま成立している:

| 盲点                  | 本 repo での実態                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| story / test 到達性   | knip の Storybook / Vitest プラグインが `*.stories.tsx` / `*.test.tsx` からの import を「使用中」と数える。live app から到達不能な component は検出しない（#1852 の実例は手動 grep で発覚） |
| CI が検出を外している | CI 配線は `quality:deadcode:ci`（`--exclude files,unlisted,binaries`）で、未使用ファイル検出自体が CI に無い                                                                                |
| scope が狭い          | 対象は `apps/product/src/**` のみ。root `scripts/`（35 test 除く本体）、`packages/*` 7 個、`apps/web`、`apps/storybook` は knip 設定を持たない                                              |

撤退条件の 4 層にこの手順は含まれないため、撤退判定そのものはこの節の精度に依存しない。

---

## 6. 4 層の削減見込みサマリー

| 層                 |          削減見込み | 精度                                             |
| ------------------ | ------------------: | ------------------------------------------------ |
| root scripts       | **14.7%**（15/102） | 高（機械判定、外部/内部参照を実測）              |
| workspace packages |       **0%**（0/7） | 高（全 package が consumer あり）                |
| current docs       |              未確定 | 低（サンプル 2 件のみ、65 ファイル全体は未走査） |
| test / story       |              未確定 | 低（5 分類が未完了。proxy 指標のみ）             |

## 7. 撤退判定

**Not Planned では閉じない。epic #2165 を継続する。**

撤退条件は「4 層すべてで削減見込みが 10% 未満」。**root scripts 層が単独で 14.7% と 10% を超えているため、この条件は docs / test-story 2 層の精度を上げなくても既に不成立**である。4 層全部を高精度で測ってから判定する必要は無く、1 層が閾値を超えた時点で「続行」の結論は確定する。

続行する場合の次 slice（未起票、epic 側で優先度判断が必要）:

1. root scripts の `未参照` 12 件 + `alias` 3 件の削除実施（最も確度が高く、着手コストも低い）
2. docs 重複の全 65 ファイル走査（サンプルでは足りないため、次 slice で本格実施）
3. test/story の 5 分類（quality 判断が要るため、専用の判定基準を先に決めてから着手）

---

**セカンドオピニオン gate（issue #2166 本文が要求）**: この overview.md の分類境界・撤退判定は、本 PR merge 前に指揮台のセカンドオピニオンを通す。
