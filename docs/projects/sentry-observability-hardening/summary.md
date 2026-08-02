---
status: current
last_verified: 2026-07-30
code: packages/observability
---

# sentry-observability-hardening 完了サマリー

Product と Web を別 Sentry project に分け、error と trace の telemetry を 1 つのプライバシー契約に揃えた。Production だけを観測対象とする。

## 完了した契約

- PII sanitizer、browser telemetry の同意ゲート、expected error の cancellation を共有 package `@dayopt/observability` に集約し、それぞれ unit test で固定した
- Product 側は入力境界を fail-closed にし、email scrub の PII と ReDoS を修正、検索語は監視経路へ出さない
- Web は独自の Sentry runtime / build integration と同意連動 UI を持ち、Product とは別 project として動く
- Production の event 証跡は operator 限定の一時 surface で取得し、取得後に撤去した（受入条件の「検証用 surface を撤去」を満たす）

## 実装

- product Sentry: `a3d1ab16c` / 入力境界 fail-closed: `cee75ab05` / PII・ReDoS 修正: `7d297f4f0`, `34d8c8b40` / 検索語除外: `7c7cf9add`
- web 分離 Sentry: `1a835db82`
- Production 検証 surface: `54d7d6f6e`, `39beca3a5`, `285739573` → 撤去: `966df4aad`

## 追跡していた issue

[#1566](https://github.com/Dayopt/dayopt/issues/1566)（Sentry 運用整備）、[#1599](https://github.com/Dayopt/dayopt/issues/1599)（Low-Value Spans）、[#1558](https://github.com/Dayopt/dayopt/issues/1558)（Vercel Sensitive env 確認）はいずれも COMPLETED で close 済み。

詳細な設計と受入条件は [overview](./overview.md) を参照する。
