# ADR-006: CI品質ゲート段階的導入ロードマップ

## ステータス

proposed（2026-03-19）

## コンテキスト

現在のCI（`.github/workflows/ci.yml`）は lint / typecheck / test / storybook-tests / build の5ジョブ + quality-gate / security-gate の集約ジョブで構成されている。加えて E2E と Integration の別ワークフローも稼働中。

一方、以下のツールはインストール・設定済みだがCIワークフローに未連携:

- **size-limit**: バンドルサイズ計測（`npm run size`）
- **Lighthouse CI**: パフォーマンス・a11y計測（`lighthouserc.cjs`設定済み）
- **knip**: デッドコード検出（`npm run quality:deadcode`）
- **diff-coverage**: 差分カバレッジ（`scripts/diff-coverage.ts`）
- **axe-core**: a11yテスト

過剰自動化を避けるという現フェーズの判断は正しい。しかし「いつ、どの順番で、何を自動化するか」のロードマップがないと、ずるずるとマニュアルのまま進むリスクがある。「そろそろCI入れた方がいいかな…」という漠然とした判断を、トリガー条件に基づく明確なアクションに変えたい。

**現在の品質指標**（2026-03-19時点）:

| 指標                       | 値           | 状態 |
| -------------------------- | ------------ | ---- |
| TypeScript errors          | 34           | fail |
| Test coverage (statements) | 43.64%       | -    |
| Feature boundaries         | 0 violations | pass |
| Circular dependencies      | 2            | -    |
| Dead code (unused exports) | 0            | pass |
| Dead code (unused files)   | 22           | -    |
| A11y                       | 未計測       | skip |

## 決定

4フェーズの段階的導入ロードマップを採用する。各フェーズにトリガー条件を設定し、YAGNIを守りながら「必要になった時にすぐ動ける」準備状態を維持する。

### 原則

1. **warn → error パターン**: 新チェックは必ずwarn（情報提供）で導入 → 最低2週間安定後にerror（ブロッキング）に昇格
2. **Gate-first**: PRブロッキングはCI Gateに集約し、週次スナップショット生成は持たない
3. **CI実行時間バジェット**: 全ジョブ並列で最大15分以内維持。重いジョブは別ワークフローに分離
4. **ロールバック容易性**: 全フェーズで `continue-on-error: true` に戻すだけでwarn降格可能

## 詳細

### Phase 1: 基盤固め + ゲート有効化

**トリガー条件**: TypeScript errors = 0 達成

**実装コスト**: 中（1-2日）

| ゲート            | 内容                                                                                     | ブロッキング |
| ----------------- | ---------------------------------------------------------------------------------------- | :----------: |
| Branch Protection | `quality-gate` + `e2e-quality-gate` を required status checks に設定                     |     Yes      |
| typecheck         | quality-gate に typecheck を含めた状態で required 化                                     |     Yes      |
| diff-coverage     | ci.yml test ジョブ後に `npm run test:diff-coverage` → PR Comment                         |     Warn     |
| knip              | lint ジョブに `npm run quality:deadcode` 追加 → 新規 unused exports を PR Comment で警告 |     Warn     |

**前提条件**:

- 34個の型エラーを全て解消し、quality-gate 配下の全ジョブが green
- diff-coverage.ts が `origin/main` ベースでCI上で動くことを確認

**なぜこの順番か**: 型チェックは最もROIが高く、既存ジョブとして稼働済み。required化するだけで即効性がある。diff-coverageとknipは既存スクリプトのCI連携のみで実装コストが低い。

---

### Phase 2: サイズ・パフォーマンス可視化

**トリガー条件**: Public Beta or GA 直前 + Phase 1 が2週間以上安定稼働

**実装コスト**: 小（半日）

| ゲート        | 内容                                                                     | ブロッキング |
| ------------- | ------------------------------------------------------------------------ | :----------: |
| size-limit    | `andresz1/size-limit-action` で PR にバンドルサイズ差分コメント          |     Warn     |
| Lighthouse CI | 新ワークフロー `lighthouse.yml` で PR 実行、既存 `lighthouserc.cjs` 利用 |     Warn     |
| a11y 計測     | Storybook Tests または Lighthouse CI で警告として可視化                  |     Warn     |

**前提条件**:

- `.size-limit` エントリポイントを package.json に設定（どのページ/チャンクを計測するか決定）
- Lighthouse CI のCI環境での安定性確認（numberOfRuns=1 で開始）

**なぜこの順番か**: GAに向けてパフォーマンスの基準値を把握する必要がある。まずwarnで傾向を掴み、基準値を決めるためのデータを蓄積する。

---

### Phase 3: ゲート厳格化

**トリガー条件**: GA後1ヶ月 or 有料ユーザー100人超 + Phase 2 の warn が4週間安定

**実装コスト**: 中（1日）

| ゲート             | 内容                                                                           |     ブロッキング     |
| ------------------ | ------------------------------------------------------------------------------ | :------------------: |
| diff-coverage 昇格 | critical path (auth/server/supabase) 80% 未満 → PR ブロック                    | Yes（critical path） |
| size-limit 昇格    | Phase 2 で蓄積したデータから上限設定、超過で PR ブロック                       |         Yes          |
| knip 昇格          | 新規 unused exports の追加を禁止（既存22 unused files は baseline として除外） |         Yes          |
| circular deps      | `npm run deps:circular` で現在の2件を超えたら fail                             |         Yes          |
| カバレッジ閾値     | statements 55% 未満で警告（漸進的に引き上げ）                                  |         Warn         |

**前提条件**:

- Phase 2 で追加した warn に false positive がないこと
- チーム内でブロッキング化の合意

**なぜこの順番か**: 有料ユーザーが増えると品質劣化のインパクトが大きくなる。Phase 2 のwarn期間で蓄積したデータに基づき、現実的な閾値を設定できる。

---

### Phase 4: フルゲート

**トリガー条件**: 有料ユーザー1,000人超 or 開発者3人以上 + Phase 3 が3ヶ月安定

**実装コスト**: 大（2-3日）

| ゲート             | 内容                                                                | ブロッキング |
| ------------------ | ------------------------------------------------------------------- | :----------: |
| Lighthouse CI 昇格 | performance >= 60, accessibility >= 90, CLS < 0.1                   |     Yes      |
| カバレッジ昇格     | statements 65% 未満 → PR ブロック                                   |     Yes      |
| a11y CI化          | storybook-tests ジョブに a11y テスト統合、`--skip=a11y` 完全撤廃    |     Yes      |
| security 強化      | `npm audit --production --audit-level=high` を security-gate に追加 |     Yes      |
| E2E critical       | smoke + critical-path spec を ci.yml に統合                         |     Yes      |

**前提条件**:

- テストカバレッジ 70% 超、Lighthouse performance 70+ 安定
- Phase 3 の全ゲートが3ヶ月以上安定稼働
- 開発チームの生産性に悪影響が出ていないこと

**なぜこの順番か**: 複数開発者が関わるとコードレビューだけでは品質を担保しきれない。フルゲートは生産性とのトレードオフが大きいため、チーム規模やユーザー数が十分に大きくなってから。

## 結果

### メリット

- 各フェーズに明確なトリガー条件があり、恣意的な導入判断を防止
- 既にインストール済みのツール群を段階的に活用でき、追加の依存は不要
- warn → error パターンにより、false positive による開発ブロックを防止
- ロールバックが全フェーズで容易（`continue-on-error: true` に変更するだけ）

### トレードオフ

- ロードマップ自体のメンテナンスコスト（トリガー条件の見直しが必要になる可能性）
- Phase 3-4 のトリガー条件（ユーザー数）は外部要因であり、技術的に自動判定できない
- warn期間中は「見えているが止められない」問題がPRに表示され続ける

## 関連

- `.github/workflows/ci.yml` — 段階的に変更する中心ファイル
- `scripts/diff-coverage.ts` — Phase 1 でCI連携
- `lighthouserc.cjs` — Phase 2 でCI連携、Phase 4 でブロッキング化
- `.claude/rules/quality.md` — 品質基準の定義
