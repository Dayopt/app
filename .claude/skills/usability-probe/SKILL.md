---
name: usability-probe
description: Haiku ユーザビリティプローブの実行依頼時、新機能が production に乗った直後の 1 flow 検証時、月次ガーデニング周期での主要フロー一周時に発動。認証済み storageState を事前生成し credential を渡さず、repo blind な browser-only agent の所見を docs/product/log へ記録する。実バグの起票は行わない。
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
2. **probe 専用 MCP を on-demand 登録する**: `.claude/rules/mcp-usage.md` §`usability-probe-browser` はオンデマンド登録する の手順に従う
3. **タスクを 1 件選び、`usability-probe` agent を起動する**（下記 §タスクリスト v1 から選ぶか、対象フローに合わせて新規に書く）。Agent tool で `subagent_type: usability-probe` を指定し、prompt にはタスク文言だけを渡す（repo 情報・実装のヒントを含めない）
4. **agent の最終応答を回収する**。agent はファイルを書けないため、構造化された報告は応答テキストとして返る
5. **後片付け**（この順序を守る。`admin-delete-user.sh` に target guard が無いため、env を正しく渡すことに集中できる状態で先にやる）:
   1. `claude mcp remove usability-probe-browser -s user` で MCP 登録を解除する
   2. test user を削除する。**`.op-env.human` は使わない**（production 専用の env file。`docs/operations/tooling.md` 参照）。local を対象にするなら `supabase status -o env` の値を使う: `NEXT_PUBLIC_SUPABASE_URL=<local> SUPABASE_SERVICE_ROLE_KEY=<local> USER_EMAIL=<setup script が出力した email> bash scripts/admin-delete-user.sh`
   3. storageState を削除する: `rm -rf "$(git rev-parse --show-toplevel)/apps/product/.probe"`。**削除後に存在しないことを確認する**（`rm -rf` は不在パスに黙って成功するため、cwd がずれていると消えたつもりで残ることがある）: `test -e "$(git rev-parse --show-toplevel)/apps/product/.probe" && echo "残っている" || echo "削除済み"`
6. **所見を記録する**: `docs/product/log/YYYY-MM-DD-haiku-probe-<flow>.md` に agent の報告を feedback ログと同じ体裁で保存する
7. **実バグ・改善候補があれば、指揮台が issue 起票する**。プローブ自身（skill も agent も）は起票しない

## タスクリスト v1

初回運用ではこの 3 件から選ぶ。実施ごとに知見を溜め、必要なら追加・入れ替える。

| タスク文言（agent へそのまま渡す）                                                | 測定対象                                                      |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 「明日の朝 9 時から 1 時間、予定を置いてください」                                | 手数（plan-format.md の Step Count と同じ数え方）、到達可能性 |
| 「先週 1 週間で何に時間を使ったか調べてください」                                 | 到達可能性、文言の伝達力（Review 画面の理解しやすさ）         |
| 「Google カレンダーと連携する画面を開いて、次に何をすればいいか確認してください」 | 空状態 CTA の伝達力。**実 OAuth 完走はさせない**（次項）      |

3 つめのタスクは実 Google OAuth 画面へ遷移した時点で終了とする。プローブに実 OAuth を完走させる設計は作らない（外部 IdP 側の同意画面まで含めると測定対象が Dayopt の UI から外れる）。

## 絶対ルール

- **credential を agent に渡さない**。ログインは `usability-probe-setup.ts` が Playwright で自身のブラウザ操作として行い、storageState だけを引き渡す
- **production では実行しない**。`usability-probe-setup.ts` は `service-role-target-guard.ts` の safety guard に従い、local / preview のみ許可する
- **agent に Read/Grep/Glob/Bash/Write を持たせない**（`.claude/agents/usability-probe.md` の `tools:` で強制済み）。repo を読ませず、ファイルも書かせない
- **agent に開発者向け tool を持たせない**（`browser_evaluate` / `browser_console_messages` / `browser_network_requests` 等）。初見ユーザーの観測解像度に合わせる
- **navigation の scope は `--allowed-origins` で宣言するが、これはセキュリティ境界ではない**（`@playwright/mcp` 公式ヘルプに明記）。実際に構造として塞がれているのは `file://` navigation だけ（`--allow-unrestricted-file-access` を渡さない限り既定でブロックされる。登録コマンドはこのフラグを渡さない）。origin 面の安全性は「agent が読める情報が probe 対象アプリの画面だけ」という設計全体に依存する
- **使用後は on-demand 登録した MCP を必ず解除し、storageState ファイルを削除する**。生セッションを含むため放置しない
- **所見の記録と issue 起票を分離する**。agent の報告をそのまま `docs/product/log/` へ落とし、価値判断（起票するか・優先度）は指揮台が行う
- **初回運用の注記**: `usability-probe` agent は `permissionMode: default` で allow 未登録のため、初回実行時は tool 承認 prompt が複数回出る。allow へワイルドカード登録はしない（on-demand 登録の意味が薄れるため）
