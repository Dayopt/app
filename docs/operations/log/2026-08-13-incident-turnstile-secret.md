---
status: frozen
date: 2026-08-13
last_verified: 2026-08-13
issue: 2031
---

# production の Turnstile secret が invalid で signup が全滅した

2026-08-13、User が production で signup を実地確認したところ「問題が発生しました。時間をおいて再度お試しください」（`auth.errors.unexpectedError`）で失敗した。当初は削除→再登録の個別バグ（#2028）を疑ったが、調査の結果 GoTrue に設定された Turnstile secret 自体が無効で、削除→再登録とは無関係に **signup が全ユーザーに対して失敗していた** production incident と判明した。

## 起きた事実

- Supabase Auth logs（User 実測、2026-08-12T23:13:09Z、request_id `019ff840-4624-70d8-a574-4f083eb9cd9c`）で確定: `POST /signup` が `400 captcha_failed` / `captcha protection: request disallowed (invalid-input-secret)` で失敗
- `invalid-input-secret` は Cloudflare Turnstile siteverify のエラーで、**client が送る token ではなく GoTrue に設定された server 側 secret 自体が無効**であることを意味する
- **根本原因**: 1Password の Turnstile secret 正本 item が誤値だった（User 確認・修正済み）。正本自体が誤りだったため、正本からの設定・突き合わせ確認・audit・Sentry のいずれの検証層も異常を検知できなかった
- CAPTCHA 検証は login / password recover にも適用されるため、signup 以外への波及可能性があった（初出時刻・`/token` `/recover` への波及確定は auth logs からの追加確認が必要で、2026-08-13 時点で未着手）

## 検知できなかった理由（全監視レイヤーの死角）

- `scripts/production-auth-config-audit.mjs` は secret 系の値を契約から意図的に除外している（値を読まない設計）ため、secret の「有効性」の drift は audit では構造的に見えない
- client 側 Sentry は 2026-07-16 以降沈黙しており（別途 #2029 で追跡中）、browser 発イベントが届いていなかった
- server 側 Sentry（`captureUnexpectedAuthError`）は 4xx を `isExpectedAuthError` で expected 分類しており、`400 captcha_failed` は capture されない設計。この分類自体は意図的（rate limit 等の正常な 4xx をノイズとして送らないため）だが、結果として今回の障害も一緒に握り潰された
- UI 側は `getAuthErrorKey` の signup context が「原因を問わず汎用メッセージ」を返す設計（OWASP ユーザー列挙防止が目的）だったため、ユーザーにも開発者にも「一時的な問題」に見えた

## 対応

- **復旧（User 手動）**: 1Password の Turnstile secret 正本 item を修正し、Supabase 側の設定も含めて更新。修正後、production で signup 成功をシークレットウィンドウで実地確認（2026-08-13）
- 復旧確認までの間、開発者自身もログアウトしないよう運用した（login も CAPTCHA 検証を通るため、ログアウトすると復旧作業用のセッション自体を失う）

## 再発防止

- UI 側: `getAuthErrorKey`（`apps/product/src/lib/auth-error.ts`）に `captcha_failed` の構造化 code 判定を追加し、login/signup/resetPassword の全 context で専用メッセージ（`auth.errors.captchaFailed`）を返すようにした（#2027 と同一 PR）。今回のような secret 無効化時に、汎用メッセージへ丸めず検知しやすくする
- 監視: secret の「値」を pin する audit 設計は維持し、secret の「有効性」を検知する canary（server 側から siteverify を定期実行、または synthetic signup）の要否は次回編成で判断する（#2031 手順5）
- 未確定の残タスク: captcha_failed の初出時刻と `/token` `/recover` への波及範囲の確定（#2031 手順2）、1Password item が誤値になった経緯の特定（#2031 手順3）。**参考（未確認・要調査）**: 2026-08-11 に同じ Turnstile secret が AI セッションの transcript へ露出する別 incident があった（[2026-08-11-incident-turnstile-secret-exposure.md](./2026-08-11-incident-turnstile-secret-exposure.md)、rotation は当時未実施と記録）。時間的に近接しているが、本 incident の直接の原因であるとは確認されていない。#2031 手順3 の調査対象に含める

## 学び

- audit が値を読まない設計（secrets.md の方針）は、値の drift や誤値そのものは検知できない。「正本の値は正しい」という前提の外側にある障害クラスであり、検知には値を読まない audit とは別の手段（有効性 canary）が要る
- OWASP ユーザー列挙防止のための汎用エラーメッセージ設計が、意図せず「本物の障害の可視性」を下げていた。列挙防止と障害可視性はトレードオフになりうることを認識し、少なくとも構造化 code（`captcha_failed` 等、アカウントの存在を漏らさない種類のエラー）は専用メッセージへ分離する

## 関連

- GitHub Issue #2031（本 incident）
- GitHub Issue #2028（当初の疑い先。削除フローとは無関係と判明）
- GitHub Issue #2027（`getAuthErrorKey` の captcha_failed マッピング追加）
- GitHub Issue #2029（client 側 Sentry の沈黙、別途追跡中）
- [2026-08-11-incident-turnstile-secret-exposure.md](./2026-08-11-incident-turnstile-secret-exposure.md)（未確認の関連候補）
