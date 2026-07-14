---
status: current
updated: 2026-07-14
---

# Resend は Vercel Marketplace へ移行せず直接連携を維持する

## 背景・当時の前提

Dayopt は Resend SDK、React Email、配信イベント Webhook、Supabase Auth SMTP をすでに運用している。
Vercel Marketplace の Resend integration は、API key の作成と Vercel Env への注入、Vercel 管理ドメインの DNS 設定、Vercel 経由の請求をまとめられる。一方、Dayopt は 1Password を長寿命 secret の master、Vercel Env を replica とする。

2026-07-14 時点で Vercel team `Dayopt` に Marketplace resource はなく、既存の `RESEND_API_KEY` は直接連携の replica として管理されている。

## 決定と理由

Resend は現在の直接連携を維持し、Vercel Marketplace へ移行しない。

- 既存の送信・Webhook・テンプレート基盤に機能上の不足がない
- Marketplace 化すると API key の生成主体が Vercel integration になり、1Password master の運用と競合する
- 稼働中 key の移行・失効、DNS・請求先の変更を伴うのに、現在得られる便益は請求と初期設定の集約が中心
- Vercel と Resend の結合を強めず、どちらかの契約・接続を変更しても email 基盤を独立して移行できる状態を保つ

## 却下した選択肢と、なぜ捨てたか

### 今すぐ Marketplace へ移行する

初期設定と請求は集約できるが、すでに稼働している環境では key rotation と replica の再同期が必要になる。新規導入時の利点に対して移行リスクが大きいため採用しない。

### 直接連携と Marketplace を併用する

API key と請求・設定の owner が二重になり、どちらが正か分からなくなるため採用しない。

## 影響・やること

- `Dayopt-Shared/resend` の `RESEND_API_KEY` を master、Vercel Production Env を replica とする
- Vercel Marketplace に Resend resource を作成しない
- Marketplace の請求集約が必要になった時、または Resend account を再作成する時だけ移行を再評価する
- 関連 issue: #1444
