# AGENTS.md

Dayopt で作業する全エージェント（Claude / Codex 含む）の正本ガイダンス。毎セッション読み込まれる唯一のファイルとして ~200 行に圧縮している。特定作業でだけ要る手順は `.claude/skills/*/SKILL.md` を参照する（末尾の Skills 索引）。機械が強制しているルール（lint / typecheck / CI / hooks）の説明は極力書かない — 機械の判定結果そのものが正であり、prose の重複は陳腐化する。

## Codex レビュー規則

Codex（OpenAI）がこの repo の PR をレビューする際の専用規則。Codex はレビュー専任で実装は行わない。どの PR を Codex に見せるかは `scripts/ci/protected-path-gate.mjs` が機械判定する（保護対象 path に触れる PR、または `review:full` ラベル付き PR）。

- レビューコメントは日本語で書く
- diff によって新たに生じる、または現実に悪化する不具合だけを指摘する。問題がなければ指摘ゼロでよい
- 指摘には優先度と、発生条件を含む現実的な failure scenario を添える
  - **P1**: 本番でユーザー影響、データ破壊、認可漏れ、または誤課金が起きる
  - **P2**: 現実的なエッジケースで誤動作し、修正せずに出荷すべきでない
- 指摘には原因と最小限の安全な修正方針を含める。到達可能な failure scenario を説明できない推測は指摘しない
- OpenAI 公式の P0/P1 表記は本ファイルの P1（最重大）へ読み替える

重点不変条件（機械では検出できない観点）:

- **CODEX-1（ユーザー・テナント分離）**: 別ユーザーのデータへ読み書きできる経路を新規に開いていないか。RLS / authorization / service role の境界を越境していないか
- **CODEX-2（Dayopt の時間不変条件）**: timezone / DST / 日境界、半開区間 `[start, end)`、overlap 判定、Plan / Log の対応関係を壊していないか
- **CODEX-3（外部契約の後方互換性）**: MCP / public API / OAuth scope、Stripe / billing / webhook、外部 calendar sync の event / payload / field name を、既存 consumer が壊れる形で変更していないか
- **TEST-1（挙動を証明しないテスト）**: 変更後の挙動を担保する test が、操作前から存在する要素・generic な assert・発火していない mock だけで通っていないか

指摘しないもの: スタイル / 可読性 / 命名の好み、PR の大きさ、「ついで refactor」、lint・型検査で確定的に検出される違反、diff と無関係な既存問題。

## シンプルルール（判断層）

迷った瞬間に戻る 5 箇条。**機能の追加・優先順位・出荷・削除を判断する時にだけ**使う。typo 修正や既存パターンへの追従で持ち出さない。

| #   | ルール                                             | 種別       |
| --- | -------------------------------------------------- | ---------- |
| 1   | **個人の 1 日が良くならないなら、作らない**        | 境界       |
| 2   | **迷ったら、計画と実績の距離を縮める方を選ぶ**     | 優先順位   |
| 3   | **Google Calendar / Toggl より一手少なく**         | 方法       |
| 4   | **不可逆だけ遅く、可逆は速く**                     | タイミング |
| 5   | **2 週間、自分が触らなかった機能は削除候補にする** | 停止       |

6 個目を足す時はどれかを削る。詳細な設計原則は [docs/strategy.md](docs/strategy.md) §4。

**テンポはルール4が決める**（判断ジャンル横断で使う3段階の authority level）:

- **AUTONOMOUS**（可逆は速く）: 承認なしで進めて事後報告する
- **CHECKPOINT**（価値判断の境界で止まる）: 顧客挙動・公開契約・権限/プライバシーに関わる時。推奨と最悪ケースを短く添えて問う
- **EXPLICIT AUTHORITY**（不可逆だけ遅く）: production mutation・release・データ削除・不可逆 migration・実課金。明示指示 + 独立レビュー + dry-run/backup が揃うまで実行しない。揃えられなければ実行せず failure mode を報告する

この 5 箇条で裁けない判断・前提を考え直す場面・ルール自体の改訂は、次の 5 原則（番号が小さい方が優先）へ上がる:

1. **破滅に賭けるな** — 失敗しても会社・信頼・安全は残るか。残らないなら期待値が高くてもやらない
2. **思惟に反するなら、速くてもやらない** — 誰の、どんな変化のためか即答できるか
3. **迷ったら学びが最大の方を選べ。撤退条件を決めてから始めよ**
4. **同点なら、扉が多く残る方を選べ**
5. **非対称なら賭けろ** — 損失に天井があり利得に天井がないなら、Rule 1 に反しない限りコミットする

## Dayopt のコア不変条件

### 時間（Plan / Record 分離モデル）

過去は変えられない。記録（Record）はユーザーが明示的に作る。

| 状態     | 判定                       |
| -------- | -------------------------- |
| upcoming | `start_at > now`           |
| active   | `start_at <= now < end_at` |
| past     | `end_at <= now`            |

判定関数: `getTimeblockState()`（`apps/product/src/features/timeblock/lib/timeblock-status.ts`）。

- **過去 Plan**: ドラッグ移動・リサイズ・時間編集・過去日付への新規追加は禁止。タイトル/タグ/メモ訂正・ワンタップ記録・skip・削除は許可
- **未来/進行中 Plan**: 全操作可。end を過去へ縮める操作のみ不可
- **Record**: 過去の事実。end が未来になる編集は不可（`end_at <= now` が条件）
- 各制約は UI（disabled/非表示）+ ロジック（早期return）の二重防御

### アーキテクチャ

- **依存方向は一方向**: `features/ -> lib/`。lib/ は feature 非依存。feature 間は barrel 経由のみ、deep import 禁止（`pnpm lint:boundaries` 機械強制）。DAG: Layer0(activities) → Layer1(timeblock, external-calendar) → Layer2(calendar, review)。settings は composition として DAG 除外。詳細判断（domain 配置、RPC transformer 配置、Composition Hub）は `pr-cross-review` skill が持つ
- **新規 API は必ず tRPC**（Router → Service → Supabase の3層、feature-colocated）。REST は既存 allowlist（`/api/health/*`, `/api/v1/system/*`, `/api/integrations/*`, `/api/mcp`, `/api/oauth/token`, `/api/cron/*`）のみ
- **状態管理**: Zustand でグローバル、useState でローカル
- **UI**: `@dayopt/components` 第一選択、semantic token 経由のみ（`pnpm lint:tokens` 機械強制）、Storybook に無いパターンは先に Story 追加（`storybook` skill）
- **ロジックの置き場**: 新規の集計・ビジネスロジックは TS service 層。既存 PL/pgSQL 関数は凍結資産（bug fix のみ）
- **楽観的更新**: ユーザー操作 mutation は不可逆操作を除き全て実装（`optimistic-update` skill）
- **エラー境界**: 機能単位で設置、アプリ全体を1つでラップしない
- **zod**: apps/product は v3 系、apps/web は v4 系に固定（`@hookform/resolvers`の協調アップグレードが要るため統一は見送り済み）。app間でスキーマ共有しない

## Non-Negotiables

- 既存コードを検索してから変更する（`rg` / `rg --files` 優先）。repo 全体を洗う時は `rg --hidden --glob '!.git/**'`（`.git/` 以外の dot ディレクトリも対象にするため）
- issue の起票・worker への作業依頼は `dispatch` skill の規約に従う
- 既存の未コミット差分はユーザー作業として扱い、勝手に revert / stage しない
- env ファイルの読み書き境界は `docs/operations/secrets.md` に従う。`.op-env.agent`/`.op-env.human` は触ってよいが、実値が入りうる `.env`/`.env.local` は読みも書きもしない
- `git add .` は避ける。path-limited add で scope を固定する。コミット前に `git diff --cached` を確認する
- コード変更後は `pnpm typecheck` / `pnpm lint` / `pnpm lint:boundaries` を通す
- コミットメッセージは日本語 Conventional Commits（Latin大文字語で始めると`subject-case`で弾かれる）
- 型: 具体的な型を使う。union の variance には `as never`（`as any` 禁止）。`unknown` は型ガードと併用のみ
- Export: named export。App Router 特殊ファイル（page/layout/loading等）のみ `export default`
- Component: 関数宣言 + props 型の直接注釈（アロー関数 const は避ける）
- ログ: `@/lib/logger` を使う。`console.log` は本番コード禁止
- 命名: `utils.ts`/`helpers.ts` を避け責務を表す具体名にする
- eslint-disable は最終手段。使う時は同じ行に `-- 理由` を書く。ファイル全体無効化より1行無効化を優先
- 依存追加前に確認: ブラウザ標準/既存依存で代替できないか、Star 1000+/直近6ヶ月更新か、出口コスト（捨てる時に何が壊れるか）を1文で言えるか
- `--no-verify` によるフックスキップは禁止（hook が機械ブロックする）
- アクセシビリティ: アイコンボタンに `aria-label`、フォームに `label` 紐付け、タッチターゲット最小 44x44px、画像に `alt`

## 実装 Plan の必須セクション

非trivialな実装 plan を提示する時、次を順に書く（trivial な1ファイル1行修正はGoal+1行Approachのみでよいが、不可逆要素があれば規模に関わらずReversibility Table必須）:

1. **Goal**（1文）
2. **Minimum Viable Approach** — 「ついで」「将来」「綺麗に」を排除した最小骨格。追加するなら理由を併記
3. **Step Count**（UIフロー新設・変更時のみ必須）— Google Calendar/Toggl等との操作数比較表。同数/多い場合は理由必須
4. **Reversibility Table** — 各stepに `[minutes]`/`[hours]`/`[days]`/`[irreversible]` タグ。irreversibleは強い正当化が必要
5. **Existing Code to Reuse** — 流用する既存関数/component の path
6. **What I'm Not Doing** — やらないことと理由（scope creepの自己検出）

## PR / git 運用

- **束ねが標準**: 機能のまとまり単位で1 PRにする。サイズを理由に分割しない。分割してよいのは不可逆migrationの隔離、独立検証・revertしたい変更のみ
- **PR判定3問**: (1) 同じレーンが書いたか (2) 壊れたら一緒に戻すか (3) クロスレビュー1巡で読み切れるか
- **PR は draft で作成**、ローカル検証（`pnpm check` + pre-pushフック）後に自己判断で ready 化する。ready化で軽量CIが起動、fix roundは ready のまま1round=1pushで積む
- **`Closes #N` を issue ごとに1行**（`Closes #1, #2`は先頭しか閉じない）。epicや部分対応は `Refs #N`
- **マージは merge commit 限定**（squash/rebase は repo 設定で無効化済み）。`pnpm branch:finish <PR番号>` でマージ〜worktree削除〜branch削除〜main最新化までワンセット実行
- **branch名**: `{agent}/{domain}-{action}[-{issue番号}]`。自動生成ランダム名は最初のPR作成前に `git branch -m` でリネーム
- **worktree運用**: 1 worktree = 1 branch = 1 PR。役目を終えたら `pnpm branch:finish` がその場で削除する。`.claude/worktrees/` 配下に作成

### レビュー

review threadは全件resolveしてからmerge（fix積む/反論reply/issue化のいずれかで閉じる。黙って閉じない）。同じ構造の指摘が2ラウンド連続で出たら、fixを積むのをやめ保証境界を明文化して以後は反論replyへ切り替える（ただし「点の追加」ではなく「classごと閉じる設計」に転換できないか先に検討する）。判断基準は「mergeした時点でmainより安全か」。

レビューのシンプルルール: (1) 壊れる筋書きを語れないなら指摘しない、語れたなら黙殺しない (2) mergeの基準は完璧ではなくmainより安全 (3) 迷ったら点を塞ぐよりclassを閉じる。

保護対象pathに触れるPR、または `review:full` ラベル付きPRは `[internal-review]` marker（`pr-cross-review` skill）が必須。それ以外はCI green + thread resolveのみでmerge可能。保護対象の基準は**外部契約 or 不可逆**（auth/OAuth/MCP、billing/webhook、migration、外部calendar provider、system API、ガードレール自身）— revertだけでは戻せない、CIで捕まらない変更に限る。timeblock/calendar/lib/timeの時間不変条件は可逆でtestが担保するため対象外だが、`features/timeblock/server/mcp-*`（MCP公開契約 + service roleのRLS迂回クエリ）と `private-timeblock-search-query.ts`（検索語のprivacy境界）は同居する外部契約・不可逆面として必須側に残す（#2489）。重く見たいPRには `review:full` を手で付ける。

### レーン運用

worktree で作業するセッション（レーン）は次を守る:

- **止まる前に連絡**する。質問・ブロック・想定外・判断待ちが発生したら、待ち状態に入る前に (1) 何で止まっているか (2) 自分の推奨 (3) 待ち中に続行できる代替作業の有無、の3点で担当issue/PRへコメントする。黙って停止しない
- **停止条件**: 同種のエラーに3回連続で失敗した／scope外のファイルを変更しないと解決できないと判明した／チケットが前提とする原因・機構が実測と食い違うと分かった、のいずれかに当たったら試行を続けず停止して報告する。エスカレーションは失敗ではなく正しい動作
- **検証の証跡原則**: 検証主張には実行コマンドと出力の要点を添える。「passした」だけの報告は不可
- issue/PRコメントが内容の正本。1 worktree = 1 branch = 1 PR、役目を終えたworktreeはその場で削除する

## 委任・報告の作法

- **委譲時はmodelを明示する**: Haiku=rename/一括置換/ログ蒸留などの機械的作業、Sonnet=通常実装・調査、Main(Opus)=判断・統合・diffレビュー・commit。省略すると同tierが継承され階層が機能しない
- **write可能なsubagentへの委譲**は次の4条件を満たす時のみ: 同一worktree、Mainと非重複scope、commit前にMainがgit diffをレビュー、commit/push/external stateの変更はMainに残す
- **確認・裁可依頼は選択肢+推奨込みが既定**。推奨を先頭に、各選択肢へ一言根拠を添える。複数の判断は1回に束ねる
- **完了報告**では利用したagent、意図的に使わなかったagentと理由、未確認事項、deferred scopeを示す
- **曖昧な指示**: (1) repo/docs/issueから判明する事実を先に調べる (2) 承認済みscope内で安全かつ可逆なら合理的仮定を明示して進める (3) 未決事項だけ証拠付き推奨とともに確認する (4) 質問・懸念を承認へ読み替えない

## Skills 索引

`.claude/skills/*/SKILL.md` を参照。該当する作業では先に読む。

| skill                  | 使う場面                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `dispatch`             | issueをworkerへ渡す準備、issue起票、束ね、状態ラベル運用                              |
| `mcp-usage`            | Sentry/Supabase/Vercel/Context7/Eagle/Playwright/GitHub/UptimeRobot 等の MCP 呼び出し |
| `skill-design`         | 新規 skill 作成・既存 skill の description/When to Use 改修                           |
| `supabase`             | migration/RLS/Storage policy/Realtime/Edge Functions                                  |
| `trpc-router-creating` | tRPC router/service の新規作成                                                        |
| `store-creating`       | 新規 Zustand store                                                                    |
| `storybook`            | Story作成・design token 選択                                                          |
| `i18n`                 | UI文言・翻訳ファイル・用語集/禁止表記                                                 |
| `error-handling`       | try/catch・tRPC onError・ErrorBoundary・Sentry連携                                    |
| `optimistic-update`    | tRPC mutation の楽観的更新                                                            |
| `security`             | 認証/認可・RLS・外部入力を受けるフォーム                                              |
| `test`                 | 新機能・バグ修正後のテスト                                                            |
| `pr-cross-review`      | merge前クロスレビュー（旧risk-reviewer/behavior-verifier観点を統合）                  |
| `docs-writing`         | ユーザー向けdocs・リリースノート・技術ドキュメント                                    |
| `docs-audit`           | 公開docsの監査                                                                        |
| `releasing`            | リリース作業end-to-end（明示依頼時のみ）                                              |
| `gardening`            | 月次ガーデニングの人間パート（明示依頼時のみ）                                        |
| `night-watch`          | 夜勤checklistの追加・変更、cron障害時の手動代行                                       |
| `morning-digest`       | 朝の蒸留層（Haiku Routine）の障害時の手動代行、蒸留仕様の変更検討                     |
| `audit-ai-config`      | AI設定の棚卸し・audit                                                                 |
| `blog-ideas`           | ブログネタ提案とissue起票                                                             |
| `usability-probe`      | Haikuユーザビリティプローブ実行                                                       |
| `decision`             | `docs/decisions.md` への意思決定1行追記                                               |

## Deploy / Release

- Staging branch と Production を同時に触らない。Staging → 開発者確認 → 指示後にProduction
- Supabase Edge Functions は `supabase functions deploy --use-api`
- release意図が明示された時だけ `releasing` skillを使う
