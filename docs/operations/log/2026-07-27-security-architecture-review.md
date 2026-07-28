---
status: frozen
date: 2026-07-27
code:
  - docs/operations/security.md
  - .claude/skills/security/SKILL.md
  - .claude/commands/gardening.md
  - package.json
---

# セキュリティレビュー体制の監査

`claude-security` plugin 導入と `security-guidance` 孤児エントリ削除を機に、セキュリティレビュー体制の全体を監査した。skill / agents / CI 7 workflow / Husky / Dependabot / GitHub 設定 / Supabase advisors / docs を確認し、read-only の照会だけで行った。

## 結論

コード変更起点のレビューは受け漏れが無い。4 層構造（実装中 / PR ごと CI / 継続 / オンデマンド）は健全で、作り直しは不要と判断した。一方、**時間経過起点の定期検査層が消滅したまま docs 上だけ残っていた**。

## 確認した層

| 層           | 実体                                                                                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 実装中       | `security` skill / `risk-reviewer` 自動委任                                                                                                                                  |
| PR ごと      | `ai-review.yml`（危険 path 限定）/ `integration.yml` の RLS snapshot drift / `ci.yml` の client bundle secret 検査 / `production-config-audit.yml` / 束ね PR の cross-review |
| 継続         | Dependabot alerts（API で有効を確認: 204）/ Actions SHA 固定 / Sentry / CSP 違反監視 / Upstash rate limit                                                                    |
| オンデマンド | `/claude-security`（本日導入）/ `/security-review` / `/code-review`                                                                                                          |

Supabase security advisors は監査時点で **0 件**（`mcp__supabase__get_advisors`）。

## 検出した gap（3 件、いずれも本 PR で対応）

1. **定期検査が docs 上のみ存在** — `security.md` 第2部が約束する週次自動レポート（`security-report.yml` / `npm run security:report` / `reports/security/`）は workflow が PR #957 で削除済みで、script もディレクトリも実在しなかった。定期検査の空白が docs で隠れていた
2. **`security` skill が存在しないエージェントを案内** — security-auditor / red-team / blue-team は `.claude/agents/` に無い（1 と同根で、定期検査の意図だけ残って実装が消えた）
3. **`/claude-security` を回す cadence が無い** — `disable-model-invocation: true` で手動専用なのに、gardening にも releasing にもセキュリティ項目が無かった

### 誤検出だった gap（記録として残す）

当初「`secrets:check` がどの自動経路にも無く、repo に commit された literal secret が検出されない」を 4 件目の gap として挙げたが、**これは監査ミスだった**。`docs-guard.yml` は全 PR で無条件に実行され、gitleaks（base ref からの差分）と `pnpm secrets:check`（tracked tree 全体）の 2 段構えで既にカバーしていた。workflow 内のコメントにも「両方無いと、既に main に入っている literal は誰にも検出されない状態が続く」と、まさにこの懸念への対処だと明記されている。

原因は調査手順の穴。`.github/` 配下を `secrets:check` で grep せず、workflow 名から `docs-guard` を「docs 整合性チェック」だと決めつけて中身を読まなかった（実際の job 名は `docs & secrets guard`）。**workflow は名前ではなく中身で判断する。**

この誤検出に基づき `check:static` へ `secrets:check` を追加していたが、CI では docs-guard と二重実行になるため取り消した。代わりにローカル一括の `pnpm check` 側へ移し、CI 相当のカバレッジをローカルでも得られる形にしている（CI での実行は docs-guard の 1 回のみ）。

副次的に、`security.md` の監査ログ節が**実装ごと架空**であることも判明した。`@/lib/audit/logger` は存在せず、`audit_logs` テーブルも `20260414150000_drop_login_attempts_and_auth_audit_logs.sql` で削除済み。rate limit 節も「参照実装済み（デプロイ待ち）」のまま Production 稼働の実態と食い違っていた。いずれも現実に合わせた。

## 監視の空白（記録として残す）

現実に合わせる過程で、**インシデント対応時に「記録が残っている」と誤認しうる空白**が 2 つ確認された。今回は docs を実態に合わせるに留め、計装は行っていない。

1. **OAuth token のライフサイクル（発行・更新・失効）を記録するテーブルが無い** — `oauth_audit_log` は名前に反して MCP tool call 用のスキーマ（`tool_name` / `called_at`）で、production からの insert 経路も未実装（参照は integration test のみ）
2. **rate limit 超過が記録されない** — `Ratelimit` は product / web とも `analytics: false`。raw identifier を保存しないための意図的な設定だが、結果として拒否されたリクエストを事後に追跡できない

いずれも認証攻撃の調査では Supabase Auth log を主 signal とすることで当面回避できる。計装が必要になった時点で、1 は insert 経路の実装、2 は analytics 有効化か 429 応答の計測を別途設計する。

## 採らなかった選択肢

**`security-guidance` plugin の再導入**（常時 hook でのパターン警告 + Stop hook LLM diff レビュー + agentic commit レビュー）:

- plugin 自身の README が、Stop hook レビューについて multi-agent / shared-worktree 構成では `ENABLE_STOP_REVIEW=0` を推奨している。Dayopt は Claude / Codex の並行 worktree 運用で、まさにこの注意書きのケース
- 実装中のガードは `security` skill + `risk-reviewer` が既に担当しており重複する
- 毎ターン終了時に追加の Opus 呼び出しが走る

**CodeQL / GitHub Advanced Security**: private repo で有料に加え、PR ごとの Actions コストが増える。Actions 課金は PR 本数に比例する構造（`.claude/rules/workflow.md` §PR 粒度）のため影響が大きい。深掘り SAST の席は `/claude-security` が埋める。

**pre-commit への `secrets:check` 追加**: `--no-verify` で bypass できるため、CI 側の担保と二重化する価値が薄い。
