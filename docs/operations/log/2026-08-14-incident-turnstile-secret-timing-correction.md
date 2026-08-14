---
status: frozen
date: 2026-08-14
last_verified: 2026-08-14
issue: 2031
---

# Turnstile secret incident の初出時刻と影響範囲を訂正する

[2026-08-13-incident-turnstile-secret.md](./2026-08-13-incident-turnstile-secret.md) は「signup が全滅」と記録したが、2026-08-14 の実測（手作業レーン Sonnet + User、Supabase Dashboard Logs Explorer）で、初出時刻と主な被害対象がいずれも誤りだったと判明した。本 log はこの訂正を記録する。詳細は GitHub Issue [#2031](https://github.com/Dayopt/dayopt/issues/2031) の 2026-08-14 コメントに一次データがある。

## 訂正内容

**手法**: Supabase Dashboard Logs Explorer で `Auth Logs` source を対象に `event_message LIKE '%captcha_failed%'` を timestamp ASC で全件取得（過去3日間、計30件）。うち 1 件（`2026-08-11T01:34:09Z`、error: `no captcha_token found`）は client が token 未送信の別種エラーで、本 incident（`invalid-input-secret`）とは無関係と判断し除外。残り 29 件が対象クラスタ。

**真の初出時刻**: `2026-08-12T05:23:47Z`（request_id `019ff46d-3c53-7c87-af62-e874c633847f`、path `/token`）。従来の incident ログに記録した `2026-08-12T23:13:09Z` は初出ではなく、**User が signup で気づいた瞬間**（後述の第二バーストの最後の 1 件）だった。実際の障害開始は記録より約 18 時間早い。

**path 別内訳（invalid-input-secret クラスタ、計 29 件）**:

| path                            | 件数  | 備考                                                |
| ------------------------------- | ----- | --------------------------------------------------- |
| `/token`（login）               | 24 件 | 05:23:47〜23:06:51 に分布。最多・最長時間影響       |
| `/signup`                       | 3 件  | 23:12:43〜23:13:09（User が気づいた瞬間のクラスタ） |
| `/recover`（password recovery） | 2 件  | 05:30:18, 05:30:22                                  |

**時間パターン**: 第一バースト（05:23〜06:35、24 件）→ 約 16.5 時間の沈黙 → 第二バースト（23:06〜23:13、4 件、User の signup テスト時）。remote_addr は全件同一（User 自身のテスト操作と推定）。

## 含意

「signup が全滅」という従来の記述は不正確で、**実際は login（`/token`）が最も長時間・最多で影響を受けていた**。login 失敗は [2026-08-13-incident-turnstile-secret.md](./2026-08-13-incident-turnstile-secret.md) の「検知できなかった理由」節が指摘するとおりエラーメッセージが汎用化される設計のため、ユーザーが「パスワード間違いかも」と誤認して見過ごしていた可能性がある。

元 log の「起きた事実」節にある初出時刻・request_id（`2026-08-12T23:13:09Z` / `019ff840-4624-70d8-a574-4f083eb9cd9c`）は「User が signup で気づいた瞬間」の記録として引き続き有効だが、「初出」としては本訂正の値（`2026-08-12T05:23:47Z`）を優先する。

## 関連

- GitHub Issue #2031（本 incident、手順 2 完了コメント）
- [2026-08-13-incident-turnstile-secret.md](./2026-08-13-incident-turnstile-secret.md)（訂正対象の元 log）
