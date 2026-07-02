---
status: current
last_verified: 2026-07-02
---

# ADR-016: CI品質ゲート段階的導入ロードマップ

> proposed（2026-03-19）

---

## コンテキスト

現在のCI（`.github/workflows/ci.yml`）は lint / typecheck / test / storybook-tests / build の5ジョブ + quality-gate / security-gate で構成済み。以下のツールはインストール・設定済みだがCIゲート未連携:

- **size-limit** — バンドルサイズ計測（`npm run size`）
- **Lighthouse CI** — パフォーマンス・a11y計測（`lighthouserc.cjs` 設定済み）
- **knip** — デッドコード検出（`npm run quality:deadcode`）
- **diff-coverage** — 差分カバレッジ（`scripts/diff-coverage.ts`）
- **axe-core** — a11yテスト

過剰自動化を避ける現方針は正しいが、トリガー条件付きのロードマップで「いつ何を自動化するか」を明確にする。

---

## 原則

| #   | 原則                 | 説明                                                                |
| --- | -------------------- | ------------------------------------------------------------------- |
| 1   | **warn → error**     | 新チェックは必ず warn で導入 → 最低2週間安定後に error 昇格         |
| 2   | **Gate-first**       | PRブロッキングはCI Gateに集約し、週次スナップショット生成は持たない |
| 3   | **15分バジェット**   | 全ジョブ並列で最大15分以内。重いジョブは別ワークフローに分離        |
| 4   | **即時ロールバック** | `continue-on-error: true` に戻すだけで warn 降格可能                |

---

## Phase 1: 基盤固め + ゲート有効化

**トリガー**: TypeScript errors = 0 達成 &nbsp;|&nbsp; **実装コスト**: 中（1-2日）

| ゲート            | 内容                                                                 | ブロッキング |
| ----------------- | -------------------------------------------------------------------- | ------------ |
| Branch Protection | `quality-gate` + `e2e-quality-gate` を required status checks に設定 | Yes          |
| typecheck         | quality-gate に typecheck を含めた状態で required 化                 | Yes          |
| diff-coverage     | ci.yml test ジョブ後に `npm run test:diff-coverage` → PR Comment     | Warn         |
| knip              | lint ジョブに `npm run quality:deadcode` 追加 → PR Comment で警告    | Warn         |

**前提条件**: 型エラー 0 達成、quality-gate 配下の全ジョブが green

**なぜこの順番か**: 型チェックは最もROIが高く既存ジョブとして稼働済み。required化するだけで即効性がある。

---

## Phase 2: サイズ・パフォーマンス可視化

**トリガー**: GA直前 + Phase 1 が2週間以上安定 &nbsp;|&nbsp; **実装コスト**: 小（半日）

| ゲート        | 内容                                                            | ブロッキング |
| ------------- | --------------------------------------------------------------- | ------------ |
| size-limit    | `andresz1/size-limit-action` で PR にバンドルサイズ差分コメント | Warn         |
| Lighthouse CI | 新ワークフロー `lighthouse.yml` で PR 実行                      | Warn         |
| a11y 計測     | Storybook Tests または Lighthouse CI で警告として可視化         | Warn         |

**前提条件**: `.size-limit` エントリポイントを package.json に設定

**なぜこの順番か**: GAに向けてパフォーマンスの基準値を把握する必要がある。まず warn で傾向を掴む。

---

## Phase 3: ゲート厳格化

**トリガー**: GA後1ヶ月 or 有料ユーザー100人超 + Phase 2 の warn が4週間安定 &nbsp;|&nbsp; **実装コスト**: 中（1日）

| ゲート             | 内容                                                        | ブロッキング |
| ------------------ | ----------------------------------------------------------- | ------------ |
| diff-coverage 昇格 | critical path (auth/server/supabase) 80% 未満 → PR ブロック | Yes          |
| size-limit 昇格    | バンドルサイズ上限超過 → PR ブロック                        | Yes          |
| knip 昇格          | 新規 unused exports の追加を禁止                            | Yes          |
| circular deps      | `npm run deps:circular` で現在の2件を超えたら fail          | Yes          |
| カバレッジ閾値     | statements 55% 未満で警告                                   | Warn         |

**前提条件**: Phase 2 の warn に false positive がないこと

**なぜこの順番か**: 有料ユーザーが増えると品質劣化のインパクトが大きくなる。warn 期間のデータから現実的な閾値を設定。

---

## Phase 4: フルゲート

**トリガー**: 有料ユーザー1,000人超 or 開発者3人以上 + Phase 3 が3ヶ月安定 &nbsp;|&nbsp; **実装コスト**: 大（2-3日）

| ゲート             | 内容                                                                | ブロッキング |
| ------------------ | ------------------------------------------------------------------- | ------------ |
| Lighthouse CI 昇格 | performance &ge; 60, accessibility &ge; 90, CLS &lt; 0.1            | Yes          |
| カバレッジ昇格     | statements 65% 未満 → PR ブロック                                   | Yes          |
| a11y CI化          | storybook-tests ジョブに a11y テスト統合                            | Yes          |
| security 強化      | `npm audit --production --audit-level=high` を security-gate に追加 | Yes          |
| E2E critical       | smoke + critical-path spec を ci.yml に統合                         | Yes          |

**前提条件**: テストカバレッジ 70% 超、Lighthouse performance 70+ 安定、Phase 3 が3ヶ月以上安定

**なぜこの順番か**: フルゲートは生産性とのトレードオフが大きい。チーム規模・ユーザー数が十分に大きくなってから。

---

## 現在の品質指標（2026-03-19）

| 指標                       | 値           | 状態 |
| -------------------------- | ------------ | ---- |
| TypeScript errors          | 34           | fail |
| Test coverage (statements) | 43.64%       | —    |
| Feature boundaries         | 0 violations | pass |
| Circular dependencies      | 2            | —    |
| Dead code (unused exports) | 0            | pass |
| Dead code (unused files)   | 22           | —    |
| A11y                       | 未計測       | skip |

---

## 関連

- `docs/log/decisions/016-ci-quality-gates-roadmap.md` — ADR本体
- `.github/workflows/ci.yml` — 段階的に変更する中心ファイル
- `scripts/diff-coverage.ts` — Phase 1 でCI連携
- `lighthouserc.cjs` — Phase 2 でCI連携
- `.claude/rules/quality.md` — 品質基準の定義
