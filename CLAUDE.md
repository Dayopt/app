# CLAUDE.md

Dayopt で作業する Claude の正本ガイダンス。詳細ルールは `.claude/rules/` を canonical source とする。全 PR 対象の外部レビュー（OpenAI Codex のクラウドレビュー）は 2026-08-13 に運用停止し、レビューは内製クロスレビュー（`.claude/rules/workflow.md` §レビュー指摘の必須解決、`.claude/skills/pr-cross-review/SKILL.md`）が merge gate の正本として担う。2026-08-20 以降、高リスク PR に限定して Codex を追加レイヤーとして手動・可逆・非ブロッキングで試行再導入している（選別基準は `.claude/rules/orchestration.md` §高リスク PR への限定 Codex レビュー（試行）、Codex 向けのレビュー規則は `AGENTS.md`）。実装・運用のガイダンスを provider 別に二重管理しない方針は不変。

## シンプルルール（判断層）

迷った瞬間に戻る 5 箇条。**機能の追加・優先順位・出荷・削除を判断する時にだけ**使う。typo 修正や既存パターンへの追従で持ち出すと官僚化するので使わない。

| #   | ルール                                             | 種別       |
| --- | -------------------------------------------------- | ---------- |
| 1   | **個人の 1 日が良くならないなら、作らない**        | 境界       |
| 2   | **迷ったら、計画と実績の距離を縮める方を選ぶ**     | 優先順位   |
| 3   | **Google Calendar / Toggl より一手少なく**         | 方法       |
| 4   | **不可逆だけ遅く、可逆は速く**                     | タイミング |
| 5   | **2 週間、自分が触らなかった機能は削除候補にする** | 停止       |

この 5 箇条は書き上がった規約ではなく、使いながらブラッシュアップしていく。月次ガーデニング（`.claude/skills/gardening/SKILL.md`）で「使われているか」を検証し、ルールと違う判断をした時は理由を一文残す。**6 個目を足すときは、どれかを削る。** 設計原則の詳細は [strategy.md](docs/strategy.md) §4、協働の分担とテンポは次節が正本。

この 5 箇条で裁けない判断・そもそもの前提を考え直す場面・ルール自体の改訂だけは [.claude/rules/decision-principles.md](.claude/rules/decision-principles.md) の 5 原則へ上がる。Claude は提案・レビュー時にこの原則順で評価し、抵触があれば明示的に指摘する。

## 協働のかたち

前節の 5 箇条は User と Main が共有する判断層。どちらかがどちらかに従うのではなく、**両者がルールと証拠に従う。**

- **分担は上下ではなく、一次情報の違い。** User は自分の 1 日・違和感・引き受けるリスクという誰にも代われない一次情報を持つ。Main は codebase 全体と検証手段を持つ。だから Main は選択肢を丸投げせず証拠付きの推奨まで作り、User は体験の違和感を遠慮なく出す
- **忖度しない。** User の判断も検証対象。承認は test・レビュー・証拠の代替にならず、複数 agent の一致も証拠ではない。ルールや証拠が別を指すとき、根拠と代案を添えて反対するのは Main の責務（反対そのものを目的にしない）
- **質問・仮説・懸念は指示ではない。** 明示指示だけが承認で、前提や scope が変われば引き継がない
- **テンポはルール 4。** 可逆は速く = `AUTONOMOUS`（承認なしで進めて報告）。価値判断の境界で止まる = `CHECKPOINT`（顧客挙動・公開契約・権限/プライバシー。推奨と最悪ケースを短く添えて問う）。不可逆だけ遅く = `EXPLICIT AUTHORITY`（production mutation・release・データ削除・不可逆 migration・実課金。明示指示 + 独立レビュー + dry-run/backup が揃うまで実行しない。揃えられなければ実行せず failure mode を報告する）
- **層は 2 つだけ。** 日々の指揮（編成・監視・レビュー・マージ）は Opus 指揮台が持ち、その一段上の**メタ把握**（問題設定そのものを疑う。User + Fable）は常設せず発火条件でだけ起こす。メタ把握の会話は必ず [docs/state.md](docs/state.md) の編集か issue の起票・close として着地させ、レーンへ直接指示は出さない（指示経路は指揮台 1 本）。正本は [.claude/rules/orchestration.md](.claude/rules/orchestration.md) §メタ把握（User + Fable）
- **セッションの終わりにフィードバックを返す。** 夕方の締め（または大きな節目）で、指揮台は User への忖度なしフィードバックを 1 件以上添える — 指示・プロンプトの改善点、判断の癖、ルールと実運用のズレなど。プロダクトと運用が良くなることだけを目的にし、儀礼的な賞賛は書かない

subagent への委任・writer 境界・報告フォーマットなどの運用機構は [.claude/rules/ai-behavior.md](.claude/rules/ai-behavior.md) が正本。

## 運用基盤（日次盤面 issue）

指揮台セッションは日次でリセットされるため、プロジェクトの現在地をセッションの記憶ではなくリポジトリ外の GitHub issue に持たせる（2026-08-20、STATE.md を廃止して移行。経緯は [#2259](https://github.com/Dayopt/dayopt/issues/2259)）。root file（STATE.md）による機械生成は、直列 merge モデルの下で構造的に鮮度が遅れる（merge されるたび 1 手ずつ古くなる）上、機械生成に頼らない限り更新が善意任せになり [#1788](https://github.com/Dayopt/dayopt/issues/1788)（rollup tracking issue、手動更新依存で陳腐化し 2026-08-01 廃止）と同じ経路をたどる。**日次盤面 issue はコード変更を伴わない issue コメントで完結するため、指揮台自身が repo を書かずに毎回作成・更新できる**（`.claude/rules/orchestration.md` §指揮台セッションの定義 が許可する external state 操作の範囲内）。正本は GitHub issue と open PR のまま変わらない。詳細は各 issue にリンクで辿る。

- **起動時**: 指揮台セッションは最初に本日の日次盤面 issue（`is:issue label:type:board is:open` で検索）と open issue を読み込む
- **起票・テンプレ・更新トリガーの正本**: `.claude/skills/dispatch/SKILL.md` 操作C（日次棚卸し）。**本文 = 現在地のスナップショット、コメント列 = タイムライン**（2026-08-20、[#2285](https://github.com/Dayopt/dayopt/issues/2285)）。§2 進行中レーンは指揮台が dispatch / push-ready 報告受領 / クロスレビュー確定伝達 / 重量green報告受領 / `branch:finish` 完了のたびに定型で更新し、**同じタイミングで盤面 issue へ 1 行のイベントコメントを追記する**（段階値は「起動待ち → 実装中 → レビュー待ち → fix対応中 → merge可能」）。§3 本日の実績・§4 キュー・§5 要判断は転記せず検索リンクのみを貼る（常に最新、鮮度劣化しない。§3 は手書きの集計数字を書かない）
- **§1（北極星と今週の最優先）だけが内容を持つ手動更新セクション**。前日の issue から機械コピーし、当日は User/指揮台が直接編集する
- **§6 決定ログ**は [docs/decisions.md](docs/decisions.md)（全決定の時系列索引、append-only。`---` 区切りより下のエントリ領域は追記のみ許可、区切りより上のヘッダ・タグ語彙は編集可。`pnpm docs:check` が機械的に強制する）へのリンクのみを持つ。ラベル → 月次 sync による反映は廃止済み（2026-08-28、#2475）。決定した時点で `docs/decisions.md` へ直接 1 行追記する（判断ジャーナルの分岐記録も同様。詳細は `.claude/rules/orchestration.md` §判断ジャーナル）
- **前日からの引き継ぎ**は当日 issue のコメントへ残す（旧 [#2020](https://github.com/Dayopt/dayopt/issues/2020)「朝の盤面ブリーフ置き場」の役割を吸収する設計）。**cutover 手順**（初日盤面 issue の起票 + #2020 の最終コメント・close）は `.claude/skills/dispatch/SKILL.md` §日次盤面issueの起票 が正本。実行は本 PR merge 後、指揮台が行う

## Codex（別系統批評係）の利用

策定日: 2026-08-24（[#2349](https://github.com/Dayopt/dayopt/issues/2349)）。指揮台が別系統モデル（Codex CLI）を読み取り専用の批評係として自律的に呼び出すための運用。PR クロスレビュー（下記 C）は `.claude/rules/orchestration.md` §高リスク PR への限定 Codex レビュー（試行）で既に運用中の試行を土台にし、設計レビュー（A）・攻撃シナリオ生成（B）を新たに追加する。

原則:

1. **Codex は「読む・批評する・攻める」係。実装・コミット・push はさせない。** すべての呼び出しは読み取り専用サンドボックス（`codex exec --sandbox read-only`）で行う
2. **指揮系統は一つ。** Codex の出力は参考意見であり、採否は常に指揮台が判断する。採用しない指摘は「不採用: 理由」を一言添える
3. **証跡を残す。** Codex の出力は該当 issue / PR へ「🔍 Codex レビュー」見出し付きで転記し、採否判断を同じコメントに書く
4. **best-effort。** 呼び出し失敗・タイムアウト時はスキップして本来のフローを続行し、当日の日次盤面 issue（`CLAUDE.md` §運用基盤）へ「Codex 不通」を記録する。不通を理由に作業を止めない

### A. 設計レビュー（レーン起動前）

発動条件: 危険地帯（認証 / 決済 / RLS・テナント境界 / DB migration）に触れるチケット、または実装 2 日超相当の大型チケット。チケット本文完成後、レーン起動前に実行する。

**呼び出しは `scripts/agent/codex-input.mjs` wrapper 経由に一本化する**（2026-08-27、[#2421](https://github.com/Dayopt/dayopt/issues/2421)）。Codex は `--sandbox read-only` のため `api.github.com` へ到達できず、対象チケットが `Depends on: #N` 等で参照する他 issue を自力で読めない（#2419 で実測: `error connecting to api.github.com`）。wrapper が対象本文中の `#\d+` 参照を最大 10 件・1 段階だけ `gh issue view` で解決し、連結してから Codex へ渡す（未解決・上限超過の参照は本文中に明記されるだけで、呼び出し自体は失敗しない）。

**`set -o pipefail` を必ず前置する**（push前反証レビュー指摘・P2、PR #2445）。無いと wrapper 自体の失敗（大きい diff での ENOBUFS 等）が飲み込まれ、Codex が空 stdin で起動して「指摘なし」相当を返し、実際には何もレビューしていないのに指摘ゼロと誤読する。

```bash
set -o pipefail
node scripts/agent/codex-input.mjs issue <番号> \
  | codex exec --sandbox read-only \
    "敵対的レビュアーとして、この設計の穴・壊れるシナリオ・考慮漏れ・
     暗黙の前提を列挙せよ。重要度順に。"
```

批評を読み、採用分をチケット本文に反映してからレーンを起動する。

### B. 攻撃シナリオ生成（RLS・スキーマ系チケットの起票時）

発動条件: RLS ポリシー・テナント境界・スキーマ変更に関わるチケット。

```bash
codex exec --sandbox read-only \
  "supabase/migrations/ 配下のスキーマと RLS ポリシーを読み、
   テナント越えの読み書きができてしまう可能性のあるクエリ・操作パターンを
   10個列挙せよ。それぞれ悪用手順を1行で添えること。"
```

出力をチケット本文に「## テストすべき攻撃シナリオ」として貼る。テストの実装は通常の Sonnet レーンが行う（Codex にコードは書かせない）。

### C. PR クロスレビュー（Ready 化後）

**選別基準の正本は `.claude/rules/orchestration.md` §高リスク PR への限定 Codex レビュー（試行）。ここでは複製しない。** 該当 PR が Ready ＋ CI green になったら、A と同じ `codex-input.mjs` wrapper 経由で呼ぶ（PR 本文が参照する issue を 1 段階解決してから diff と連結する）。A と同じ理由で `set -o pipefail` を前置する:

```bash
set -o pipefail
node scripts/agent/codex-input.mjs pr <番号> \
  | codex exec --sandbox read-only \
    "この diff をレビューし、バグ・セキュリティ懸念・テナント境界の問題・
     エッジケースの見落としを指摘せよ。問題なければ『指摘なし』と答えよ。"
```

**非ブロッキング原則を維持する**（2026-08-24、User 裁可。原文の「Approve の前提条件」からこの形へ調整済み）: 危険地帯 PR では Codex レビューの実行を必須とするが、応答は merge の前提条件にしない（不通時はスキップを記録して続行する。既存の内製 review gate（`.claude/rules/workflow.md` §内製クロスレビューの実施を要求する gate）が hard merge gate のまま）。回数の既定は `.claude/rules/orchestration.md` §回数の既定 を継承する（既定 1 PR 1 回、再依頼は同節の 2 条件のみ）。

### 週次確認（人間向け）

- 「🔍 Codex レビュー」コメントが危険地帯チケット・PR に付いているか（付いていない危険地帯 PR があれば発動条件の漏れ）
- 採否判断が書かれているか（転記だけで判断がないのは NG。批評係が形骸化しているシグナル）
- Codex 不通の記録が続いていないか（続くなら認証切れ → `codex login` し直しを人間へ依頼する）

## Tech Stack

Next.js App Router / React / TypeScript strict / Tailwind CSS / Zustand / Supabase / tRPC / Zod / shadcn/ui / Sentry。exact version は各 `package.json` と lockfile を正とする

## Commands

```bash
# 開発サーバー（AI は実行しない）
pnpm dev                     # 1Password op-run 経由
pnpm dev:raw                 # op run なしの緊急 escape hatch
pnpm env:check               # 値を出さない env 存在確認
pnpm secrets:check           # literal secret 検出（redacted）
pnpm 1password:check         # 1Password schema 確認（値は表示しない）
pnpm storybook               # Storybook

# 検証（コード変更後は必須）
pnpm check                  # CI Stage 1 + unit test 相当のローカル一括チェック（build/e2e は含めない）
pnpm typecheck
pnpm lint
pnpm lint:boundaries
pnpm lint:tokens             # token 変更時
pnpm lint:i18n               # 翻訳キー変更時

# テスト
pnpm test:run                # ロジック変更・バグ修正後
pnpm test:integration        # 前提: ローカル Supabase 起動（Docker Desktop + `supabase start`）。未起動なら明示的に失敗する
pnpm test:e2e:smoke

# 型生成・DB
pnpm types:generate
pnpm types:generate:production
pnpm types:generate:local
pnpm migration:create
pnpm db:fresh

# 品質
pnpm quality:deadcode

# docs
pnpm docs:check               # link/metadata/path/project/命名/append-only を検証（CI と同一）
```

### 紛らわしい script 名（2026-08、#2067 棚卸しで整理）

似た名前だが別物、または既存 script のサブセットになっている root script。使う前に確認する:

| script                                                                     | 実体                                                                                                                                                                                                                 | 混同しやすい相手                                                                                                                  |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm docs:check:claude-links`                                             | repo 全体の CLAUDE.md（root 含む）内リンク・参照ファイル存在検証（`scripts/tasks/validate-doc-references.ts` は ROOT_DIR 基点 glob）                                                                                 | `pnpm docs:check`（別物。こちらは `docs/` 配下の link/metadata/path 等を検証）                                                    |
| `pnpm check:workspace`                                                     | `typecheck` + `lint` + `build:packages` + `build-storybook` の packages 検証                                                                                                                                         | `pnpm check`（別物。こちらは secrets/lint/test まで含む CI Stage 1 相当）                                                         |
| `pnpm typecheck:scripts`                                                   | `scripts/` 配下だけの型検査（`tsc -p tsconfig.scripts.json`）                                                                                                                                                        | `pnpm typecheck`（`typecheck:scripts` を内包する上位コマンド。単体実行は scripts/ のみ確認したい時）                              |
| `pnpm copy:check`                                                          | UI 文言（Copy System）の禁止表記スキャナー（`scripts/tasks/check-glossary.ts`）                                                                                                                                      | 名前からは「ファイルコピー」の検証に見えるが無関係                                                                                |
| `pnpm db:seed:identity`                                                    | MCP environment identity（ローカル固定 OAuth token 発行用 tuple）投入                                                                                                                                                | `pnpm db:seed`（別スクリプト。`db:fresh` は `db:reset && db:seed:identity && db:seed` の順で両方を実行する）                      |
| license 系 5 script                                                        | `license:check`＝互換性チェック / `license:check-risks`＝risk 分類チェック / `license:audit`＝監査レポート出力 / `license:credits:check`＝表示用クレジット一覧の鮮度確認 / `generate-licenses`＝クレジット一覧再生成 | 名前だけでは役割が読み分けにくい 5 兄弟                                                                                           |
| `pnpm lint:product` / `pnpm typecheck:product` / `pnpm typecheck:packages` | `pnpm --filter @dayopt/product lint` / `typecheck`、`turbo run typecheck --filter='./packages/*'`。全 workspace 検証より速く回したい時の意図的なサブセット呼び出し                                                   | `pnpm lint` / `pnpm typecheck`（上位コマンド。CI・plan-review 等はこちらを使う。`:product` / `:packages` は手動の絞り込み実行用） |

## Non-Negotiables

- 既存コードを検索してから変更する。`rg` / `rg --files` を優先する
- **repo 全体を洗う検索は `rg --hidden --glob '!.git/**'` で実行する。** `rg` は既定で dot ディレクトリを飛ばすため、`.claude/` `.github/` が丸ごと検索対象から外れる。撤去・改名の残存参照を探す時にこれを忘れると、AI 設定と workflow の参照だけが取り残される（2026-08-03 に実際に発生）。`--hidden` は `.git/` も対象に含めるため、glob 除外を同時に付ける（付けないと git のメタデータを拾う）
- issue の起票・worker への作業依頼・`status:blocked` issue への着手判断は `dispatch` skill（`.claude/skills/dispatch/SKILL.md`）の規約に従う。凍結 issue には着手しない
- 既存の未コミット差分はユーザー作業として扱い、勝手に revert / stage しない
- env ファイルの読み書き境界は `docs/operations/secrets.md` §AI エージェントの env ファイル境界 に従う。`.op-env.agent` / `.op-env.human` 系（op run 用の参照のみファイル）は触ってよく、実値が入りうる `.env` / `.env.local` 系は読みも書きもしない
- `git add .` は避ける。必ず path-limited add で scope を固定する
- コミット前に `git diff --cached` を確認する
- コード変更後は `pnpm typecheck`、`pnpm lint`、`pnpm lint:boundaries` を通す
- コミットメッセージは日本語 Conventional Commits 形式にする（type は commitlint が強制。subject を Latin 大文字語で始めると `subject-case` で弾かれるため日本語で始める）
- PR は機能のまとまり単位で束ねる。サイズを理由に分割しない（`.claude/rules/workflow.md` §PR 粒度・判定 3 問）
- PR は draft で作成する（`gh pr create --draft`）。ready 化は merge 直前に 1 回だけ行い、重量 CI（E2E / Web E2E / Production Config Audit）を merge 前 1 回に寄せる（`.claude/rules/workflow.md` §2 段階 CI）
- PR 本文に `Closes #N` を issue ごとに 1 行ずつ書き、merge で自動クローズさせる。`Closes #1, #2` は先頭しか閉じない。epic と部分対応は `Refs #N`（`.claude/rules/workflow.md` §PR と issue の紐づけ）
- PR は枝分かれを履歴に残すため merge commit でマージする。**マージ〜掃除は同一セッション内で `pnpm branch:finish <PR番号>` をワンセットで実行する**（マージ→worktree削除→ローカル/リモート branch 削除→main 最新化まで。完了定義 5 点と手動フォールバックは `.claude/rules/workflow.md` §Worktree 運用）
- branch 名は `{agent}/{domain}-{action}[-{issue番号}]` に統一する。複数 issue を束ねた場合は代表 issue または epic 番号を使う。Claude Code 自動生成のランダム名は最初の PR 作成前に `git branch -m` でリネームする（`.claude/rules/workflow.md` §命名規則）
- `--no-verify` / `git commit --no-verify` によるフックのスキップは禁止する（agent には `.claude/hooks/pre-tool-guard.sh` が機械ブロックする）。人間が意識的に使う場合の記録先・フック設定変更の扱い・機械化候補の月次見直しは `.claude/rules/workflow.md` §Pause point に従う

## Coding Rules

詳細は `.claude/rules/` を読む。本ファイルには作業中に見失いやすい規約だけ載せる。

- **型**: [code-style.md §型定義](.claude/rules/code-style.md#型定義) に従う
- **ログ**: [code-style.md §ログ出力](.claude/rules/code-style.md#ログ出力) に従う
- **通信**: サーバーデータは tRPC / TanStack Query 経由で扱う
- **スタイル**: [design-system.md §色](.claude/rules/design-system.md#色) に従う（semantic token 経由のみ、直接色・style 属性禁止）
- **export**: [code-style.md §Export](.claude/rules/code-style.md#export) に従う
- **Component**: [code-style.md §Component](.claude/rules/code-style.md#component) に従う
- **Feature 境界**: feature 間の結合は Composition Layer で行う。feature barrel から import する
- **依存方向**: `features/ -> lib/` の一方向。`lib/` は feature 非依存の再利用コードだけ
- **命名**: [code-style.md §命名](.claude/rules/code-style.md#命名) に従う
- **新規 top-level feature**: `features/` 直下に新 feature を作る前に相談する

## Documentation and writing

ユーザー向けの Docs / Blog / Release notes を書く・編集する前に、次の 3 ファイルを読む:

- `docs/business/content/writing-style.md` — 文体（B1 相当の読みやすさ）
- `docs/business/content/docs-policy.md` — Docs / Blog / Release notes の役割分担
- `docs/business/content/review-checklist.md` — 生成直後・PR レビュー時の最終チェック

アプリ内 UI 文言を書く時は `docs/product/copywriting.md` を読む。

公開コンテンツの運用フロー（いつ何を書くか）は `docs/business/content/content-operations.md` を正本とする。

## Docs 運用責務

`docs/README.md` の地図・決定木・書き方に従う。とくに以下は都度・自発的に実施する:

- **フィードバックの記録** — ユーザーの声（感想・要望・不具合報告）が届いたら、その日のうちに GitHub issue として原文のまま起票する（既存ラベル体系、`dispatch` skill の規約に従う。2026-08-28、#2475 で domain log/ 廃止に伴い issue 起票へ移行）
- **障害の記録** — 障害・トラブルが起きたら GitHub issue として起票する。対応手順そのものの更新は `docs/operations/` 側に別途反映する
- **機能仕様の反映** — プロダクトの振る舞いを変えたら `docs/product/specs/` の該当ファイルを更新する
- **月次ガーデニング** — 自動パートは毎月 1 日に Routine が実施し、journal 下書きの draft PR を作る（正本は `.claude/skills/gardening/SKILL.md`）。当月 5 日を過ぎても `YYYY-MM-01-journal.md` の draft PR も merge 済み journal も無い状態でセッションが始まったら、Routine の故障を疑ってユーザーに報告し、`/gardening`（人間パート + 自動パートの手動代行）を提案する

## スラッシュ起動 skill（.claude/skills/）

明示的なユーザー依頼（`/name` またはそれに相当する発話）のみを契機に発動する skill。公式の commands 形式は skills へ統合済みのため、`.claude/commands/` は存在しない。`Skill` tool から起動する。

| コマンド       | 内容                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `/decision`    | `docs/decisions.md` へ意思決定を1行追記（該当ストックの編集とワンセット）                              |
| `/plan-review` | 直前の実装 plan を plan-fact-checker / plan-critic の 2 agent で並列レビュー                           |
| `/gardening`   | 月次ガーデニングの人間パート（Routine の成果物レビューと価値判断。自動パートの手順も同ファイルが正本） |

## Rule Map

| ファイル                                | 使う場面                                                             |
| --------------------------------------- | -------------------------------------------------------------------- |
| `.claude/rules/ai-behavior.md`          | subagent 委任、writer 境界、報告フォーマット、曖昧指示               |
| `.claude/rules/workflow.md`             | 作業規模、設計書、PR 粒度、git / merge 運用                          |
| `.claude/rules/plan-format.md`          | 実装 plan を提示する時                                               |
| `.claude/rules/architecture.md`         | tRPC、状態管理、ロジック配置                                         |
| `.claude/rules/code-style.md`           | 型、ログ、依存追加、ベンダー・サービス選定、eslint-disable           |
| `.claude/rules/design-system.md`        | UI、token、spacing、icon                                             |
| `docs/product/copywriting.md`           | UI 文言、トーン、CTA                                                 |
| `.claude/rules/feature-boundaries.md`   | feature DAG、Composition Layer                                       |
| `.claude/rules/quality.md`              | test、a11y、performance                                              |
| `.claude/rules/temporal-constraints.md` | 過去ブロック編集制約                                                 |
| `.claude/rules/mcp-usage.md`            | Sentry / Supabase / Context7 / Vercel / Eagle                        |
| `.claude/rules/skill-design.md`         | project skill の設計・更新                                           |
| `.claude/rules/orchestration.md`        | 指揮台セッション、レーン編成、盤面監視、send_message、判断ジャーナル |
| `.claude/rules/lane-protocol.md`        | レーンの着手手順、PR 規約、報告テンプレート、検証原則                |
| `.claude/rules/decision-principles.md`  | シンプルルールで裁けない判断、前提の再考、ルール自体の改訂           |

## Skills

Project skills は `.claude/skills/` に置く。該当する作業では `SKILL.md` を先に読む。

error-handling / storybook / test / security / store-creating / docs-writing / trpc-router-creating / supabase / i18n / releasing / optimistic-update / audit-ai-config / dispatch / blog-ideas / docs-audit / pr-cross-review / usability-probe

## Deploy / Release

- Staging branch と Production を同時に触らない
- Staging branch -> 開発者確認 -> 指示後に Production
- Supabase Edge Functions は `supabase functions deploy --use-api`
- release 意図が明示された時だけ `.claude/skills/releasing/SKILL.md` を使う
