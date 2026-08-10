---
status: frozen
date: 2026-08-11
last_verified: 2026-08-11
issue: 1920
---

# Supabase Management API の設定読戻しで Turnstile secret が transcript に露出した

2026-08-11、#1917 の調査で Supabase Management API から本番 Auth 設定を読み戻した際、要求していない `security_captcha_secret`（Cloudflare Turnstile secret key の replica）が応答に含まれ、フィルタを素通りして AI セッションの transcript に平文で出力された。値は repository、GitHub Issue、PR、公開ログへ転記していない。

## 起きた事実

- 目的は #1917 の完了条件にある Secure Email Change の有効・無効の確認だった。必要だったのは boolean 1 つ（`mailer_secure_email_change_enabled`）。
- `SUPABASE_ACCESS_TOKEN` は 1Password から `op run` で解決し、値を表示せず `Authorization` header にだけ渡した。この経路は設計どおりで、token 自体は露出していない。
- 呼んだのは Management API の `GET /v1/projects/{ref}/config/auth`。この endpoint は GoTrue の設定を単一の JSON で返し、boolean 設定と secret 系フィールドが同じ応答に同居する。
- 応答は `curl -o` でローカルの一時ファイルへ直接保存した。stdout を経由しないため `op run` の secret masking は原理的に働かない。加えて masking の対象は op 自身が解決した値だけなので、応答に含まれる secret には元から適用されない。
- 保存した JSON を Python の**部分一致** keyword フィルタで絞った。`security_captcha_enabled` / `security_captcha_provider` を拾う意図で `CAPTCHA` を含めたため、同じ部分文字列を持つ `security_captcha_secret` も一致し、値ごと出力された。
- 露出したのは `security_captcha_secret` の値。1Password の `turnstile` item にある `TURNSTILE_SECRET_KEY` の Supabase Dashboard replica にあたる。
- 別途、最初の疎通確認で `op run --no-masking` を使った。`.claude/rules/mcp-usage.md` が禁じている指定で規約違反にあたる。この call の出力は token 未解決を示す判定文字列だけで、今回の露出の原因ではない。
- 応答を保存した一時ファイルは現存しない（確認済み）。

## 影響範囲

- 露出先はローカルの AI セッション transcript と会話ログに限定される。git、PR、GitHub Issue、公開ログへの混入はない。
- 露出したのは Cloudflare Turnstile の secret key で、product と web が**同一 widget を共有**している（両者とも `NEXT_PUBLIC_TURNSTILE_SITE_KEY` を参照）。したがって影響は 2 経路に及ぶ。
  - web の問い合わせフォーム — `apps/web/src/lib/turnstile/verify.ts` が siteverify を叩く。replica は Vercel Production Env。
  - product の Auth Bot Protection（login / signup / password reset）— 検証は Supabase 側。replica は Supabase Dashboard。
- secret key は siteverify を呼ぶ側を詐称するために使われうる。bot protection の検証を迂回する方向のリスクで、顧客データへの直接アクセス権は持たない。
- 不正利用の証拠は確認していない。

## 対応

- **Turnstile secret の rotation は 2026-08-11 時点で未実施。** User 判断で実施する。値の操作（Cloudflare での再発行、1Password master 更新、replica 更新）はすべて User 専管とし、AI は値に触れない。
- 手順の正本は [secrets.md §Change Procedure](../secrets.md)。この incident 固有の注意点は、replica が **Vercel Production Env と Supabase Dashboard の 2 箇所**あり、両方を更新しないと問い合わせフォームか Auth のどちらかが壊れることだけ。

## 学び

- 2026-07-22 の [Vercel CLI token 露出](./2026-07-22-incident-vercel-cli-token-output.md) と**同型の再発**。前回の学びは「長寿命 token を command line 引数へ渡さない」と入力側を塞ぐものだったが、今回壊れたのは出力側だった。制御プレーンの metadata 確認が、要求していない secret を応答へ混ぜて返す点が両者に共通する。`workflow.md` の「一回きりは再発したら昇格させる」に該当する。
- AI の secret 境界（[secrets.md §AI エージェントの env ファイル境界](../secrets.md)）は**ファイルパスの形**で書かれ、`.claude/settings.json` の `Read(**/.env)` deny と `pre-tool-guard.sh` の `.env` 書き込みブロックで実装されている。今回の経路は Bash + curl + 任意のファイル名で、どちらの網にも構造的に掛からない。基本方針 4「値を表示しない」は原則としては該当するが、enforcement を持たない。
- 設定の読戻しは応答全体を保存せず、必要なフィールドだけへ射影してから表示する。`jq` の完全一致射影を使い、部分一致の keyword フィルタは使わない。`*_secret` / `*_key` / `*_token` に一致するキーは出力しない。
- 再発防止の明文化（secrets.md への `jq` 射影必須化の追記）は本 branch の scope 外とし、#1920 で行う。Refs #1920

## 関連

- GitHub Issue #1917
- GitHub Issue #1920
- [2026-07-22 Vercel CLI の一覧出力に認証 token が含まれた](./2026-07-22-incident-vercel-cli-token-output.md)
