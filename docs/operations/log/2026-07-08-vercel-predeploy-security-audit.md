---
status: frozen
last_verified: 2026-07-08
---

# Vercel pre-deploy / security readiness audit

Issues #1502, #1461, #1459 を同じ作業単位として確認した。
値は確認せず、Vercel project metadata、env metadata、未認証 HTTP response だけを見た。

## 対象

- Vercel team: `Dayopt`
- Projects: `product`, `web`
- Branch: `codex/vercel-predeploy-security`

## 確認結果

- `product` と `web` の preview URL は未認証で `302` to `https://vercel.com/sso-api`。
- `dayopt.app` と `app.dayopt.app` は production として `200`。
- `mcp.dayopt.app` は未認証で `401`。
- `product` Preview に production Supabase credentials は見えない。
- `product` の Automation Bypass は存在し、Vercel env var として管理されている。
- local Vercel CLI `50.32.5` の `vercel deploy --help` に `--dry` は出ていない。
- Vercel CLI API で production / preview の server-only secret 12 件を `sensitive` に更新した。

## 残タスク

- Preview に置かれている long-lived secrets の必要性を見直す。
- Development scope に残した `encrypted` secrets の必要性を見直す。
- `vercel deploy --dry` は CLI / docs の両方で確認できるまで pre-deploy check に入れない。

## 関連

- Stock: `docs/operations/security/environment-secrets.md`
- Issue: #1502, #1461, #1459
