---
status: frozen
date: 2026-08-25
issue: 2379
---

# gitleaks 8.30.1 更新に伴う全履歴棚卸し

## 背景

#2379。gitleaks を 8.9.0 → 8.30.1 へ更新するにあたり、4 年分拡張されたルールセットで repo 全体（全 git 履歴）をスキャンし、既存コードに対する新規 false positive を棚卸しした。

## スキャン実行環境

- gitleaks **8.30.1**（`brew install gitleaks` のローカル floating latest。CI の pin 版と同一バージョンで実施）
- コマンド: `gitleaks detect --source . --redact`（`.gitleaks.toml` 導入前の default ruleset のみで実行し、母集団を確定してから allowlist を設計した）
- 対象: 3346 commits
- 結果: 121 findings、14 distinct な secret 値に集約（同一値が commit 履歴上の複数箇所で繰り返し出現するため）

## 分類結果

値そのものはこの log に載せない（public repo かつ本 log は初回作成後凍結され訂正できないため）。rule-id・対象 path・現状態・判定・対応先だけを記録する。

| #   | rule-id         | 値の性質（要約）                                                                                                   | 代表 path                                                                                            | 現状態                                  | 対応                                                                                                           |
| --- | --------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | jwt             | Supabase CLI がローカル環境へ共通発行する固定デモ JWT（issuer: supabase-demo、service_role）                       | `apps/product/src/lib/test/integration/*.integration.test.ts` 等                                     | live                                    | `.gitleaks.toml` で値ベース抑止                                                                                |
| 2   | jwt             | 同上（anon variant）                                                                                               | 同上                                                                                                 | live                                    | `.gitleaks.toml` で値ベース抑止                                                                                |
| 3   | generic-api-key | Supabase ローカル固定 publishable key（`sb_publishable_...`）                                                      | `scripts/seed-dev-data.sh`                                                                           | live                                    | `.gitleaks.toml` で値ベース抑止                                                                                |
| 4   | generic-api-key | `useCalendarKeyboard.ts` の keyboard shortcut 文字列（modifier+key の組み合わせ値）。`key:` フィールド名への誤検知 | `apps/product/src/features/calendar/hooks/keyboard/useCalendarKeyboard.ts`                           | live                                    | `.gitleaks.toml` で path + 値の AND 条件で抑止（path 単独では抑止しない）                                      |
| 5   | generic-api-key | truncated JWT fixture（末尾が literal `...` で終わる非機能値）                                                     | `apps/product/src/lib/supabase/__tests__/oauth.test.ts`                                              | live                                    | `.gitleaks.toml` で値ベース抑止                                                                                |
| 6   | generic-api-key | Google reCAPTCHA v2 の公式テストキー（site key、常に success を返す設計として Google 自身が公開）                  | 旧 `docs/security/RECAPTCHA_SETUP.md`（削除済み）                                                    | historical                              | `.gitleaks.toml` で値ベース抑止（公開既知値のため、将来別 doc に再掲されても安全に抑止できるよう先回りで登録） |
| 7   | generic-api-key | 同上（secret key）                                                                                                 | 同上                                                                                                 | historical                              | 同上                                                                                                           |
| 8   | jwt             | scrub-pii の合成 JWT fixture（sub は連番、署名は連番文字列の非機能値）                                             | 旧 path。現 `apps/product/src/lib/sentry/__tests__/scrub-pii.test.ts` にはこの値自体が既に存在しない | historical                              | 対応不要（現行ファイルへ値を確認済み）                                                                         |
| 9   | jwt             | CI workflow の placeholder JWT（payload に `"placeholder"` を含む非機能値）                                        | `.github/workflows/ci.yml` の旧バージョン。現行版に `eyJ` 文字列は存在しない                         | historical                              | 対応不要（現行ファイルへ値を確認済み）                                                                         |
| 10  | jwt             | e2e workflow の dummy JWT（payload に `"ref":"dummy"` を含む非機能値）                                             | 旧 `.github/workflows/e2e*.yml`（削除済み workflow）                                                 | historical                              | 対応不要                                                                                                       |
| 11  | generic-api-key | eslint ルール doc の bad-example コード片                                                                          | 旧 `docs/compliance/eslint-rules.md`（削除済み）                                                     | historical                              | 対応不要                                                                                                       |
| 12  | generic-api-key | Sentry セットアップ doc の連番 placeholder token                                                                   | 旧 `SENTRY_SETUP_GUIDE.md` / `docs/integrations/SENTRY.md`（削除済み）                               | historical                              | 対応不要                                                                                                       |
| 13  | generic-api-key | database-verification-report.md / setup-guide.md 内の同種 placeholder                                              | 旧 path（削除済み）                                                                                  | historical                              | 対応不要                                                                                                       |
| 14  | gcp-api-key     | GCP/Firebase Web API key 形式の文字列                                                                              | 旧 `src/lib/firebase.ts`（削除済み、2025-06-29 commit）                                              | historical だが**値が実在の可能性あり** | `.gitleaks.toml` には登録せず、別 issue へ切り出し（本文に実値は書かない）                                     |

## 「historical」を `.gitleaksignore` に登録しなかった理由

CI の gitleaks は `gitleaks detect --log-opts="${BASE}..HEAD"` による diff-range scan のみを行い（`docs-guard.yml`）、全履歴 scan は行わない。上記「historical」判定の対象は、ファイル自体が現在の tree に存在しないか、ファイルは存在してもフラグされた値自体が現行版から既に取り除かれている。したがって、これらを含む commit が将来どの PR の diff range にも再び入ることはない。

commit 単位の `.gitleaksignore` fingerprint（`commit:file:rule-id:line`）を100件超この履歴に登録しても、実際に CI の green/red を左右する経路が存在せず運用上の価値が無い。一方「live」判定の対象は、将来 PR がそのファイルを touch すると**新しい commit として**再び diff に載り、commit-fingerprint 型の抑止では追従できない（fingerprint は commit SHA を含むため、新しい commit には一致しない）。そのため live 分は commit に依存しない値ベースの `.gitleaks.toml` allowlist（`[[allowlists]]`、`regexTarget = "secret"`）で抑止した。設計判断の詳細検討は #2379 を参照。

## 検証

`.gitleaks.toml` 導入後、全履歴 scan の findings は 14 distinct values → 1（Firebase key のみ、意図的に未抑止）に減少したことを実測した。加えて scratch git repo で CI と同一コマンド形状（`gitleaks detect --config .gitleaks.toml --redact --log-opts="<base>..<head>" --exit-code 1`）を用い、以下を確認した:

- allowlist 対象の値を、全く新しい未知の commit / path で再導入しても `exit 0` で通ること（commit-fingerprint 方式では防げなかった再発パターンが、値ベース allowlist では防げることの実証）
- 未登録の secret 様値を含む新規 commit は `exit 1` で検出されること（allowlist がルールセット全体を無力化していないことの実証）
- `useCalendarKeyboard.ts` と同じ path へ意図的に本物らしい secret を追加しても、`condition = "AND"` により値パターン不一致で allowlist が成立せず、正しく検出されること（path 単独抑止のリスクを潰せていることの実証）
