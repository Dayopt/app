---
status: frozen
date: 2026-07-21
code: .github/workflows/ci.yml
---

# GitHub Code Qualityを採用しない

GitHub Code Qualityの課金開始に合わせて、Dayoptでは同機能を品質ゲートへ採用せず、既存CI・CodeQL・自動コードレビューを維持する判断を確認した。

## 判断

- GitHub Code QualityはOrganization / Repositoryの両方で無効を維持する
- Code Quality由来のrequired checkやcoverage thresholdは追加しない
- lint、typecheck、unit test、build、bundle size、E2E、集約Quality GateをRequired checksとして維持する
- セキュリティ静的解析はCodeQLを継続する
- Copilotのautomatic first reviewとCodex reviewを継続する
- 本番の例外検知はSentryを継続する
- 将来カバレッジ閾値が必要になった場合はVitest / CIで直接管理する

## 確認した証跡

- Organization設定とRepository設定はいずれも「Enable Code Quality」と表示され、Code Qualityは無効だった
- Dayopt Organizationのbase planはGitHub Freeだった
- 2026年7月のBilling usageは確認時点ですべてBilled amountが0だった
- repository rulesetのRequired checksは既存GitHub Actionsだけで、Code Quality由来のcheckはなかった
- CodeQL workflowはactiveだった
- Copilot automatic first review rulesetはactiveだった

## 再評価条件

Code Quality固有の検査やorganization横断dashboardが、既存CI・CodeQL・自動レビューでは代替できない価値を持ち、その効果がactive committer課金と追加Actions利用を上回ると判断できた場合だけ再評価する。有効化時はbilling impactとruleset差分を先に確認する。
