---
status: frozen
date: 2026-08-10
---

# 契約サービス一覧から Slack を外し、Anthropic / OpenAI を運用契約として載せる

## 背景・当時の前提

- `docs/company/accounts.md` の Slack 行は「課金イベント通知の任意 webhook」として、確認先を `apps/product/src/features/billing/server/notifications/` としていたが、この path は実在しない。実装は `apps/product/src/app/api/webhooks/stripe/route.ts` の `notifySlack` で、`SLACK_BILLING_WEBHOOK_URL` が未設定なら no-op になる
- 創業者（ユーザー）に確認したところ、Slack は運用していない。webhook は未設定で通知は一度も飛んでいない
- 一方、会社は Anthropic（Claude Code による開発エージェント、月次ガーデニングの Routine）と OpenAI（ChatGPT による Codex クラウド PR レビュー `@codex review`、情報収集）を契約・運用の中核として依存しているが、表に載っていなかった。原因は更新ルールの「Anthropic / OpenAI は runtime 依存ではない。AI 連携はユーザーが選ぶ MCP / API client 側で行う。」という一文が、「表に一切載せない」と読める書き方になっていたこと。実際には表には GitHub / 1Password / Gmail など product runtime 外の運用契約がすでに載っており、runtime 依存でないことは表から外す理由にならない

## 決定と理由

- **Slack 行を表から削除する。** 実際に契約・運用していないサービスを載せ続けると、この表を索引として信頼できなくなる
- **Anthropic（Claude）と OpenAI（ChatGPT）を表に追加する。** 用途は開発エージェント（Claude Code）・月次ガーデニング Routine（Anthropic）、Codex クラウド PR レビュー・情報収集（OpenAI）。確認先はそれぞれ `CLAUDE.md` / `.claude/` と `AGENTS.md`
- **更新ルールの一文を書き換える。** 「product runtime 依存ではない（製品コードが API key を消費しない）」という限定であることを明確にし、開発・運用契約としては本表に載せる方針にする

## 却下した選択肢と、なぜ捨てたか

- **Slack 行の確認先 path だけを実コード（`apps/product/src/app/api/webhooks/stripe/route.ts`）に修正して残す** — 未使用・未設定の契約を現行表に置き続けると、他の行と同様に「今使っている」という誤った前提を読者に与える。webhook 実装自体は残るため、再度使う判断をした時に改めて追記すればよい

## 影響・やること

- `docs/company/accounts.md` を本ログと同じ変更で更新する（Slack 行削除、Anthropic / OpenAI 行追加、更新ルール文言修正、`last_verified` 更新）
- コード側の残骸（`notifySlack` 関数、`SLACK_BILLING_WEBHOOK_URL` env、production-build-gate や monitoring/runbook 内の Slack 言及）の撤去は本ログの scope 外。別 issue で行う
