# バージョニング管理ガイド

## 📋 目次

- [概要](#概要)
- [Semantic Versioning](#semantic-versioning)
- [バージョンアップ手順](#バージョンアップ手順)
- [リリースフロー](#リリースフロー)
- [バージョニング計画](#バージョニング計画)

## 概要

Dayoptは [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) に準拠したバージョン管理を行います。

## Semantic Versioning

### バージョン形式

```
X.Y.Z
```

- **X (MAJOR)**: 破壊的変更を含む場合にインクリメント
- **Y (MINOR)**: 後方互換性のある新機能追加時にインクリメント
- **Z (PATCH)**: 後方互換性のあるバグ修正時にインクリメント

### バージョンアップの判断基準

#### MAJOR (X) - 破壊的変更

- API の破壊的変更
- データベーススキーマの非互換変更
- 設定ファイル形式の変更
- 依存関係の大幅な変更

**例**: `1.0.0` → `2.0.0`

#### MINOR (Y) - 新機能

- 新しい機能の追加
- 既存機能の拡張
- パフォーマンス改善
- 非推奨機能の追加（削除は次のMAJOR）

**例**: `1.0.0` → `1.1.0`

#### PATCH (Z) - バグ修正

- バグ修正
- セキュリティパッチ
- ドキュメント修正
- リファクタリング

**例**: `1.0.0` → `1.0.1`

## バージョンアップ手順

### 1. バージョンアップコマンド

```bash
# PATCH (0.0.1 → 0.0.2)
npm version patch -m "chore: bump version to %s"

# MINOR (0.0.1 → 0.1.0)
npm version minor -m "feat: bump version to %s"

# MAJOR (0.0.1 → 1.0.0)
npm version major -m "feat!: bump version to %s"
```

### 2. リリースノート作成

```bash
# docs/releases/vX.Y.Z.md を作成
cp docs/releases/template.md docs/releases/vX.Y.Z.md
# 内容を編集
```

### 3. コミット & プッシュ

```bash
# npm version コマンドが自動でコミット＆タグを作成
git push origin dev
git push origin vX.Y.Z
```

### 4. GitHub Release 作成

```bash
# GitHub CLI を使用
gh release create vX.Y.Z \
  --title "Release vX.Y.Z" \
  --notes-file .github/RELEASE_TEMPLATE.md

# または GitHub UI から手動作成
# https://github.com/t3-nico/dayopt/releases/new
```

## リリースフロー

### 開発フロー

```
1. 機能開発 (feature/xxx ブランチ)
   ↓
2. dev ブランチにマージ
   ↓
3. テスト・品質チェック
   ↓
4. バージョンアップ
   ↓
5. リリースノート更新
   ↓
6. タグ作成 & プッシュ
   ↓
7. GitHub Release 作成
   ↓
8. 自動デプロイ (Vercel)
```

### プレリリース

開発版やベータ版をリリースする場合:

```bash
# アルファ版
npm version prerelease --preid=alpha
# 例: 0.1.0-alpha.0

# ベータ版
npm version prerelease --preid=beta
# 例: 0.1.0-beta.0

# リリース候補
npm version prerelease --preid=rc
# 例: 0.1.0-rc.0
```

## バージョニング計画

### ロードマップ

| バージョン | 目標             | 主な内容          |
| ---------- | ---------------- | ----------------- |
| **v0.0.1** | 初回リリース     | 基本機能実装      |
| **v0.0.x** | バグ修正         | 初期不具合対応    |
| **v0.1.0** | TypeScript厳格化 | strict mode完了   |
| **v0.2.0** | テスト強化       | カバレッジ60%達成 |
| **v0.3.0** | E2Eテスト        | Playwright導入    |
| **v1.0.0** | 正式リリース     | 本番運用開始      |

### v1.0.0 までの条件

- [ ] TypeScript strict mode完全対応
- [ ] テストカバレッジ80%以上
- [ ] E2Eテスト導入
- [ ] パフォーマンス最適化
- [ ] セキュリティ監査完了
- [ ] ドキュメント整備完了
- [ ] 本番環境での安定稼働確認

## ベストプラクティス

### ✅ 推奨

- リリース前に必ず `npm run lint` と `npm run typecheck` を実行
- 破壊的変更は BREAKING CHANGE として明記
- バージョンタグは必ず `v` プレフィックスを付ける（例: `v0.0.1`）

### ❌ 非推奨

- リリース後のバージョン番号の変更
- タグの削除・付け替え

## 参考リンク

- [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html)
- [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
- [npm version](https://docs.npmjs.com/cli/v8/commands/npm-version)

---

**種類**: 📙 リファレンス
**最終更新**: 2025-12-11
**所有者**: Dayopt 開発チーム
