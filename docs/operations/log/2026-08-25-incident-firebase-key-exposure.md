---
status: frozen
date: 2026-08-25
last_verified: 2026-08-25
issue: 2400
---

# 旧 Firebase project（t3nico）の API key が git 全履歴に露出していた

2026-08-25、gitleaks の全履歴スキャン更新（#2379、8.9.0 → 8.30.1）で、モノレポ移行前の旧レイアウトに存在した Firebase の `apiKey` が `gcp-api-key` ルールで検出された。

## 起きた事実

- 検出経路: #2379 の gitleaks バージョン更新に伴う repo 全体（全 git 履歴）の再スキャンで 1 件検出
- rule-id: `gcp-api-key`
- 対象ファイル: `src/lib/firebase.ts`（モノレポ移行前の旧 layout。現在の tree には存在しない）
- 該当 commit: `d4de3aa7521869ade7e21a98c9197e4c2945231a`（2025-06-29、"feat: Firebase設定を更新し、プロジェクトと連携完了"）
- fingerprint: `d4de3aa7521869ade7e21a98c9197e4c2945231a:src/lib/firebase.ts:gcp-api-key:6`
- ファイル内容は Firebase Web SDK の `firebaseConfig`（`apiKey` / `authDomain` / `projectId` 等）で、`projectId: "t3nico"` を指す。Dayopt は現在 Firebase を tech stack として使っておらず（Supabase ベース）、モノレポ移行のどこかのタイミングで削除された古い prototype コードだった

## 反対証拠（誇張しないための前提）

Firebase の Web API key は**設計上 client bundle に公開される識別子**であり、Google 自身がこれを「秘匿すべき secret」として扱っていない（Firebase Security Rules / API 制限で保護する設計）。露出それ自体は自動的に critical incident ではない。実リスクは「API 制限が掛かっていない × 課金が有効な API と組み合わさっている」場合に限られる。

## 影響範囲

- `t3nico` project は Dayopt が現在使用している production 基盤（Supabase）と無関係で、認証・データアクセスへの直接的な影響は無い
- 露出は git 全履歴（public repo）に限られ、Dayopt の現行環境変数・secret とは独立している

## 対応

- User が 2026-08-25 に対応済み（`t3nico` project 側の API key / project の削除。#2400 issue コメント「削除済み」で確認）
- git 履歴からの該当 commit 削除（history rewrite）は実施していない。理由: key 自体が既に無効化済みであり、public repo の履歴書き換えは他 clone との不整合を招く不可逆操作のため、実害の無い旧 secret に対してはコストに見合わないと判断した

## 再発防止

- gitleaks の allowlist canary（`scripts/ci/gitleaks-allowlist-canary.sh`）が #2401 で `.github/workflows/docs-guard.yml` の `docs-guard` job に導入済み。gitleaks の ruleset が意図せず無効化された場合（`.gitleaks.toml` の破損等）に検出する
- gitleaks 自体を 4 年分古い 8.9.0 から 8.30.1 へ更新したことで、今回のような古い commit 内の secret を新しいルールセットで発見できるようになった（#2379）

## 学び

- モノレポ移行前の prototype コードに、移行後は参照されなくなった secret が残っていることがある。今回のように tech stack が完全に切り替わった（Firebase → Supabase）場合、切り替え前の設定ファイルが git 履歴に残ったまま忘れられやすい
- gitleaks のような静的スキャナーは pin したバージョンが古いままだとルールセットも古いままになり、検出できる secret パターンが年々目減りする。定期的なバージョン更新自体が発見のトリガーになった（今回がその実例）

## 関連

- GitHub Issue #2400（本 incident の検出・対応）
- GitHub Issue #2379（gitleaks 8.9.0 → 8.30.1 更新、本 incident の検出契機）
- GitHub Issue #2401（gitleaks allowlist canary 導入）
