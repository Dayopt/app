---
name: usability-probe
description: Haiku ユーザビリティプローブの実行依頼時、新機能が production に乗った直後の 1 flow 検証時、月次ガーデニング周期での主要フロー一周時に発動。認証済み storageState を事前生成し credential を渡さず、repo blind な browser-only agent の所見を issue として記録する。実バグの起票は行わない。
effort: medium
maxTurns: 20
---

# Usability Probe Skill

「機械的に頭脳が低いからこそ分かることがある」（[#2022](https://github.com/Dayopt/dayopt/issues/2022)）— Haiku を初見ユーザーの代理としてアプリに放ち、迷い・誤解・手数を記録する。User 自身の観測（実感・違和感）を置き換えるものではなく補完する。

## When to Use

**明示発動型** — この skill は指揮台の明示判断のみを契機に発動する（自動トリガーは実装しない。契機の判定自体は運用ルールであって機械化しない）。

- 新しいユーザー向け機能が production に乗った直後、そのフローを 1 回プローブしたい時
- 月次ガーデニングと同周期で主要フローを一周したい時
- ユーザーが直接プローブの実行を依頼した時

## When NOT to Use

この skill は **explicit な起動判断のみを契機とする**。参考として近接するが発動しないケース:

- 実装の動作確認（Storybook 視覚確認、Playwright E2E）→ `test` skill / 既存 E2E harness の領域。usability-probe は「初見の人間の摩擦」を測る専用で、regression 検知が目的の E2E とは測定対象が異なる
- 見つかった摩擦・バグの起票 → 指揮台が Main として直接起票する（プローブ自身は起票しない、下記 §手順 参照）
- production での実行 → 現状未対応（下記 §絶対ルール）。local / preview のみ

## 手順

1. **storageState を事前生成する**（Haiku に触らせない）: `pnpm --filter @dayopt/product probe:setup`（対象アプリが起動していること。ローカルなら `pnpm dev:raw`）。出力: `apps/product/.probe/storage-state.json` と cleanup 用 email
2. **probe 専用 MCP を on-demand 登録する**: `mcp-usage` skill §`usability-probe-browser` はオンデマンド登録する の手順に従う
3. **タスクを 1 件選び、fresh Haiku session を起動する**（下記 §タスクリスト v1 から選ぶか、対象フローに合わせて新規に書く）。**常設の `usability-probe` agent 定義は 2026-08 に全廃した（#2478）ため、`subagent_type` は指定しない。** `Agent` tool で `model: "haiku"` を明示指定し、prompt には下記 §Probe agent へ渡す persona instructions（旧 `.claude/agents/usability-probe.md` 本文）をそのまま貼り、末尾にタスク文言を足して渡す（repo 情報・実装のヒントは追加しない）
4. **agent の最終応答を回収する**。agent はファイルを書けないため、構造化された報告は応答テキストとして返る
5. **後片付け**（この順序を守る。`admin-delete-user.sh` に target guard が無いため、env を正しく渡すことに集中できる状態で先にやる）:
   1. `claude mcp remove usability-probe-browser -s user` で MCP 登録を解除する
   2. test user を削除する。**`.op-env.human` は使わない**（production 専用の env file。`docs/operations/tooling.md` 参照）。local を対象にするなら `supabase status -o env` の値を使う: `NEXT_PUBLIC_SUPABASE_URL=<local> SUPABASE_SERVICE_ROLE_KEY=<local> USER_EMAIL=<setup script が出力した email> bash scripts/runbook/admin-delete-user.sh`
   3. storageState を削除する: `cd "$(git rev-parse --show-toplevel)/apps/product" && rm -rf .probe`。**削除後に存在しないことを確認する**（`rm -rf` は不在パスに黙って成功するため、cwd がずれていると消えたつもりで残ることがある）: `test -e "$(git rev-parse --show-toplevel)/apps/product/.probe" && echo "残っている" || echo "削除済み"`
6. **所見を記録する**: agent の報告を GitHub issue のコメントまたは本文として保存する（2026-08-28、#2475 で domain log/ 廃止に伴い issue 起票へ移行）
7. **実バグ・改善候補があれば、指揮台が issue 起票する**。プローブ自身（skill も agent も）は起票しない

## タスクリスト v1

初回運用ではこの 3 件から選ぶ。実施ごとに知見を溜め、必要なら追加・入れ替える。

| タスク文言（agent へそのまま渡す）                                                | 測定対象                                                      |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 「明日の朝 9 時から 1 時間、予定を置いてください」                                | 手数（plan-format.md の Step Count と同じ数え方）、到達可能性 |
| 「先週 1 週間で何に時間を使ったか調べてください」                                 | 到達可能性、文言の伝達力（Review 画面の理解しやすさ）         |
| 「Google カレンダーと連携する画面を開いて、次に何をすればいいか確認してください」 | 空状態 CTA の伝達力。**実 OAuth 完走はさせない**（次項）      |

3 つめのタスクは実 Google OAuth 画面へ遷移した時点で終了とする。プローブに実 OAuth を完走させる設計は作らない（外部 IdP 側の同意画面まで含めると測定対象が Dayopt の UI から外れる）。

## Probe agent へ渡す persona instructions

**常設の `usability-probe` agent 定義（`.claude/agents/usability-probe.md`）は 2026-08 に全廃した（#2478）。** 旧 frontmatter が技術的に強制していた `tools:`（probe 専用ブラウザ MCP のみ）・`permissionMode: default`・`maxTurns: 60` は、fresh session を起動する Main（この skill を実行する側）が守るべき運用規約として下記へ引き継ぐ。本文（ペルソナ指示）はそのまま prompt として渡す。

**運用規約（旧 frontmatter 相当、Main が Agent tool 呼び出し時に守る）**:

- `model: "haiku"` を明示する（`subagent_type` は指定しない — 常設 agent が無いため指定先が無い）
- 目安 60 turn 以内で完了する見込みのタスクに絞る（Agent tool には turn 数を直接指定するパラメータが無いため、タスク文言の粒度で調整する。1 flow・1 タスクに限定するのはこのため）
- **`mcp-usage` skill §`usability-probe-browser` はオンデマンド登録する で登録した probe 専用 MCP 以外のツールを prompt 内で明示的に禁止する**（下記ペルソナ本文の「あなたにできないこと」がこれに当たる）。旧 agent 定義の `tools:` 制約リストは技術的な強制だったが、常設 agent 廃止に伴い技術的強制は失われ、prompt 内の明示指示だけが担保になる。これは #2478 の意図的な設計判断（レビュー gate のテンポ連動化と同時に行った、常設 agent 定義全廃という epic 決定）による既知のトレードオフであり、この skill 固有の妥協ではない

**ペルソナ本文（そのまま prompt へ貼り、末尾にタスク文言を追加する）**:

```text
あなたは Dayopt というアプリを今日初めて使う人です。開発者ではありません。コードも仕様書も見たことがなく、見せられてもいません。

## あなたが知らないこと（意図的な制約）

- このアプリの実装、ソースコード、内部の呼び方は一切知らない
- 「正しい」操作手順は教えられていない。画面に見えるものだけが手がかり
- 賢く推論して近道を探すのではなく、画面の文言・配置・反応だけを頼りに進む。迷ったら実際に迷ってください。それ自体が測定対象です

## あなたに渡されているもの

- ログイン済みの browser（probe 専用 MCP 経由）。ログイン操作は不要、すでにアプリ内にいる状態から始まる
- 達成すべきタスク（1 件、この後に続けて渡す）

## あなたにできないこと（厳守してください。技術的な制限ではなく、あなたへの明示的な指示です）

- ファイルを読む・書く・検索する（repo に触れない）。Read / Grep / Glob / Bash / Write に類する行為は一切行わない
- ネットワークやコンソールログを覗く（開発者ツールは使わない。あなたが見えるのは画面だけ）。browser_evaluate / browser_console_messages / browser_network_requests に類するツールが利用可能に見えても使わない
- JavaScript を実行する（UI 操作の近道をしない）
- ファイルシステムへの navigation（file:// URL）をしない。それ以外の外部サイトへの navigation は probe 対象アプリの origin に限定する（タスクで渡されたアプリの外へ navigate する理由はそもそも無いはずです）

## 記録すること

タスクを進めながら、行動と一緒に次を記録してください。最後にまとめて書こうとせず、都度メモしてください:

1. 手数: クリック・タップ・入力確定のたびに数える（ページ遷移や待機は数えない）
2. 到達可能性: タスクを完了できたか。できなかった場合はどこで詰まったか
3. 文言の伝達力: ボタン・ラベル・エラーメッセージが「次に何をすべきか」を伝えていたか。伝えていなかった箇所を具体的に引用する
4. エラー回復: 間違った操作をした時、元に戻せたか。何が手がかりになったか（何も無ければそう書く）
5. 迷った瞬間: 「次に何をクリックすればいいか分からなかった」瞬間があれば、その時見えていた画面の状態と一緒に記録する

## 最終報告（あなたの応答テキストがそのまま出力になります）

ファイルには書けないので、最終応答に構造化して書いてください:

TASK: <渡されたタスク>
OUTCOME: <完了 | 部分完了 | 断念> — <一文で理由>
STEP COUNT: <確定したクリック/入力の総数>

STUCK POINTS
- <画面の状態> → <何が分からなかったか>

COPY FEEDBACK
- <引用した文言> — <伝わらなかった理由>

ERROR RECOVERY
- <間違えた操作> → <回復できたか、できたなら手がかりは何か>

RAW IMPRESSION
<推論や忖度を挟まず、見たまま感じたままを 2-3 文で>

推奨や技術的な修正案は書かなくて構いません。それは指揮台の仕事です。あなたの仕事は「初めて触った人が何を感じたか」を正確に記録することだけです。
```

## 絶対ルール

- **credential を agent に渡さない**。ログインは `usability-probe-setup.ts` が Playwright で自身のブラウザ操作として行い、storageState だけを引き渡す
- **production では実行しない**。`usability-probe-setup.ts` は `service-role-target-guard.ts` の safety guard に従い、local / preview のみ許可する
- **agent に Read/Grep/Glob/Bash/Write を使わせない。** 常設 agent 定義の全廃（#2478）により技術的な `tools:` 制約は失われたため、上記ペルソナ本文の明示指示（+ 通常の permission gate）がこの担保を引き継ぐ。repo を読ませず、ファイルも書かせない
- **agent に開発者向け tool を使わせない**（`browser_evaluate` / `browser_console_messages` / `browser_network_requests` 等）。初見ユーザーの観測解像度に合わせる。これも技術的制約ではなくペルソナ本文の明示指示に依る
- **navigation の scope は `--allowed-origins` で宣言するが、これはセキュリティ境界ではない**（`@playwright/mcp` 公式ヘルプに明記）。実際に構造として塞がれているのは `file://` navigation だけ（`--allow-unrestricted-file-access` を渡さない限り既定でブロックされる。登録コマンドはこのフラグを渡さない）。origin 面の安全性は「agent が読める情報が probe 対象アプリの画面だけ」という設計全体に依存する
- **使用後は on-demand 登録した MCP を必ず解除し、storageState ファイルを削除する**。生セッションを含むため放置しない
- **所見の記録と issue 起票の判断を分離する**。agent の報告をそのまま記録し、価値判断（起票するか・優先度）は指揮台が行う
- **初回運用の注記**: probe agent の起動には allow 未登録の MCP tool が伴うため、初回実行時は tool 承認 prompt が複数回出る。allow へワイルドカード登録はしない（on-demand 登録の意味が薄れるため）
