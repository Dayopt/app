---
status: frozen
date: 2026-08-17
issue: 2031
---

# Turnstile secret 有効性検知は能動的 canary ではなく passive instrumentation で閉じる

## 背景・当時の前提

[2026-08-13-incident-turnstile-secret.md](./2026-08-13-incident-turnstile-secret.md) の再発防止手順5（secret の「有効性」を検知する canary の要否判断）。issue 本文は「server 側から siteverify を定期実行、または synthetic signup」という能動的 canary を仮説として挙げていた。

調査の結果、検知漏れの真因は「secret の有効性を確認する手段が無かった」ことではなく、**既に流れていた信号を `apps/product/src/lib/sentry/integration.ts` の `EXPECTED_AUTH_ERROR_CODES` が握り潰していた**ことだと判明した。`captcha_failed` が無条件で expected 分類に入っており、Sentry へ一切送られていなかった。

ローカル Supabase の `[auth.captcha]` を一時的に有効化して実測したところ（config.toml は検証後に revert、commit なし）、GoTrue は secret 無効時と token 無効時のどちらも `error_code: 'captcha_failed'`（構造化コードは同一）を返すが、`msg` フィールドは `invalid-input-secret` / `invalid-input-response` で明確に区別できることを確認した。

## 決定と理由

**能動的 canary は実装せず、既存の Sentry 分類ロジックを直す passive instrumentation のみで閉じる。**

- product: `isExpectedAuthError` に例外を追加し、`code === 'captcha_failed'` でも raw message が `invalid-input-secret` を含む場合は unexpected 扱いにして即時 Sentry capture する
- web: `apps/web/src/app/api/contact/route.ts` で `verifyTurnstile` の結果が `!success` かつ `error-codes` に `invalid-input-secret` を含む場合、`captureUnexpectedWebError` を明示発火する（従来は success:false を一律 403 BOT_DETECTED として握り、captcha 失敗系の Sentry 送信が皆無だった）

理由:

1. 検知遅延の真因（Sentry の握り潰し）は passive instrumentation で直接塞げる。今回の incident は実際には login（`/token`）だけで 18 時間弱の間に 24 件発火しており、passive instrumentation があれば最初の実失敗（分〜時間単位）で拾えていた
2. 元 issue の「値の pin ではなく有効性の probe で閉じる」という意図は、GoTrue が実際に下した siteverify 結果を監視するという点で passive instrumentation でも満たされる
3. 能動的 canary は新しい運用コストを生む: 定期 workflow・auth logs への合成トラフィック混入（将来の incident 調査のたびに除外作業が要る。本 issue の手順2で実際にこの除外作業をした）

## 却下した選択肢と、なぜ捨てたか

- **Cloudflare siteverify を直接叩く canary**（`TURNSTILE_SECRET_KEY` を新しく GitHub Secrets へ複製し、定期的に siteverify へテスト呼び出しする）: 却下。secret の複製先が増え、[2026-08-11-incident-turnstile-secret-exposure.md](./2026-08-11-incident-turnstile-secret-exposure.md) と同型の露出面拡大になる。さらに構造的な欠陥として、1Password master の値を Cloudflare へ直接 probe する方式は「Supabase Dashboard の replica だけが独立に壊れる」ケース（今回とは違う将来の障害パターン）を検知できない（値の一致は確認できるが、実際に GoTrue が使っている値の有効性は確認できない）
- **GoTrue の公開 `/token` `/signup` endpoint を直接叩く canary**（secret 不要、`msg` フィールドで判定可能なことをローカルで実測確認済み）: 技術的には成立するが、passive instrumentation が同じ検知ギャップを低コストで塞ぐため、追加の運用コスト（定期 workflow、auth logs への合成トラフィック）に見合わないと判断し見送った

## 影響・やること

- 実装は PR で `Closes #2031`（milestone v0.34）
- `apps/product/src/lib/sentry/integration.ts` の `TURNSTILE_SECRET_INVALID_MESSAGE` 判定は GoTrue の raw message 文言（`invalid-input-secret`）に依存する。この文言は Cloudflare の公開仕様ではなく GoTrue 実装依存のため、将来のバージョンアップで静かに変わりうる。`captcha-secret-invalid-detection` 系の unit test が現行文言を pin しており、そちらが red になったら判定も同時に見直すこと
- **能動的 canary の再開条件**: passive instrumentation が実際に見逃した事故（例: auth トラフィックが極端に少ない時間帯に secret が壊れ、Sentry 発火まで許容できない時間がかかった等）が発生した場合、上記「却下した選択肢」の GoTrue endpoint 直叩き案（secret 複製不要）を再検討する

## 関連

- GitHub Issue #2031（本 issue、手順5）
- [2026-08-13-incident-turnstile-secret.md](./2026-08-13-incident-turnstile-secret.md)
- [2026-08-11-incident-turnstile-secret-exposure.md](./2026-08-11-incident-turnstile-secret-exposure.md)
