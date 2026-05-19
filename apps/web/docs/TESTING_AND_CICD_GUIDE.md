# 品質管理・CI/CDガイド

このドキュメントでは、Dayopt Webプロジェクトの品質管理戦略、CI/CDワークフロー、開発プラクティスについて説明します。

## 概要

プロジェクトでは以下を使用した品質管理と継続的インテグレーション/デプロイ（CI/CD）システムを実装しています：

- **ESLint** - コード品質チェック
- **TypeScript** - 型安全性の確保
- **Prettier** - コードフォーマット
- **アクセシビリティ監査** - WCAG 2.1 AA準拠確認
- **パフォーマンス監査** - Core Web Vitals測定
- **GitHub Actions** - 自動CI/CDパイプライン
- **Husky + lint-staged** - プリコミットフック

## 品質管理コマンド

### コマンド一覧

| コマンド                      | 説明                           |
| ----------------------------- | ------------------------------ |
| `npm run lint`                | ESLintでコード品質チェック     |
| `npm run lint:fix`            | ESLint自動修正                 |
| `npm run type-check`          | TypeScript型チェック           |
| `npm run format`              | Prettier実行                   |
| `npm run format:check`        | Prettierチェック               |
| `npm run audit:accessibility` | アクセシビリティ監査           |
| `npm run audit:performance`   | パフォーマンス監査             |
| `npm run test:a11y`           | ビルド後アクセシビリティテスト |
| `npm run test:performance`    | ビルド後パフォーマンステスト   |

### 開発ワークフロー

```bash
# 開発サーバー起動
npm run dev

# 品質チェック実行
npm run lint && npm run type-check

# 本番準備（推奨）
npm run prepare:production
```

## 監査システム

### アクセシビリティ監査

`src/scripts/accessibility-audit.js` でWCAG 2.1 AA準拠を確認します。

**チェック項目**:

- 適切なalt属性
- 色コントラスト比
- キーボードナビゲーション
- ARIAラベル
- フォーカス管理

```bash
# アクセシビリティ監査のみ
npm run audit:accessibility

# ビルド後にテスト
npm run test:a11y
```

### パフォーマンス監査

`src/scripts/performance-audit.js` でCore Web Vitalsを測定します。

**目標値**:
| 指標 | 目標値 |
|------|--------|
| LCP (Largest Contentful Paint) | < 2.5秒 |
| FID (First Input Delay) | < 100ms |
| CLS (Cumulative Layout Shift) | < 0.1 |

```bash
# パフォーマンス監査のみ
npm run audit:performance

# ビルド後にテスト
npm run test:performance
```

## CI/CDパイプライン

### ワークフロー概要

プロジェクトではGitHub Actionsを使用したCI/CDパイプラインを実装しています。

#### CIワークフロー

**トリガー**: `dev`/`main`へのpush、`dev`/`main`へのPR

**ジョブ**:

- 依存関係インストール (`npm ci`)
- リント実行 (`npm run lint`)
- 型チェック実行 (`npm run type-check`)
- アプリケーションビルド (`npm run build`)
- アクセシビリティ監査
- パフォーマンス監査

#### デプロイワークフロー

**トリガー**: `main`ブランチへのpush、手動ディスパッチ

**ジョブ**:

- 本番ビルド準備
- Vercelデプロイ
- デプロイ後検証

### 品質ゲート

#### 必須要件

- TypeScriptコンパイル成功
- ESLintがエラーなしで通過
- ビルドプロセス正常完了

#### パフォーマンス要件

- Lighthouseパフォーマンススコア > 90
- First Contentful Paint < 1.8秒
- Largest Contentful Paint < 2.5秒
- Cumulative Layout Shift < 0.1

#### アクセシビリティ要件

- WCAG 2.1 AA準拠
- 色コントラスト比 > 4.5:1
- キーボードナビゲーション対応
- スクリーンリーダー互換性

## プリコミットフック

Huskyとlint-stagedによるプリコミットフックが設定されています。

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["prettier --write", "eslint --fix"],
    "*.{json,md,yml,yaml}": ["prettier --write"]
  }
}
```

コミット時に自動的に:

1. Prettierでフォーマット
2. ESLintで修正可能なエラーを自動修正

## 開発ワークフロー

### 1. ローカル開発

```bash
# 開発サーバー起動
npm run dev

# 品質チェック実行
npm run lint && npm run type-check && npm run build
```

### 2. フィーチャー開発

```bash
# フィーチャーブランチ作成
git checkout -b feat/your-feature-name

# フィーチャー実装
# 品質チェック
npm run lint && npm run type-check

# 変更をコミット（lint-stagedが自動実行）
git add .
git commit -m "feat: フィーチャーの説明"

# pushしてPR作成
git push origin feat/your-feature-name
```

### 3. プルリクエストプロセス

1. **PR作成** - `dev`ブランチをターゲット
2. **自動チェック**が自動実行：
   - CIパイプラインが品質チェック実行
   - プレビューデプロイ作成
   - 品質ゲート評価
3. チームメンバーによる**コードレビュー**
4. 承認とチェック成功後に**マージ**

### 4. リリースプロセス

1. `dev`ブランチで**フィーチャー完了**
2. `dev`から`main`への**リリースPR作成**
3. ステージング環境での**本番テスト**
4. `main`へのマージで**本番デプロイ**
5. 自動監査による**デプロイ後検証**

## トラブルシューティング

### よくある問題

#### 1. ESLintエラー

```bash
# 自動修正を試行
npm run lint:fix

# 手動で確認
npm run lint
```

#### 2. TypeScriptエラー

```bash
# 型チェック確認
npm run type-check
```

#### 3. ビルド失敗

```bash
# 依存関係を再インストール
rm -rf node_modules package-lock.json
npm install

# ビルド実行
npm run build
```

### ヘルプ

#### ドキュメントリソース

- [ESLint](https://eslint.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [GitHub Actions](https://docs.github.com/en/actions)

#### 内部リソース

- `CLAUDE.md` - プロジェクト概要とコマンド
- `docs/DOCUMENTATION_GUIDE.md` - ドキュメントガイドライン
- `docs/PERFORMANCE_GUIDE.md` - 最適化戦略

## 将来のロードマップ

### 短期

- [ ] ユニットテストフレームワーク（Vitest）の導入検討
- [ ] コンポーネントテストの実装
- [ ] E2Eテスト（Playwright）の導入検討

### 中期

- [ ] テストカバレッジレポート
- [ ] 自動セキュリティスキャン
- [ ] パフォーマンス予算設定

---

_このガイドはコードベースと共にメンテナンスされています。質問や改善提案はissueを作成するかPRを提出してください。_

**最終更新**: 2025年1月
