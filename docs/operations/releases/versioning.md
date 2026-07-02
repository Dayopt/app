---
status: current
last_verified: 2026-06-17
---

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

version bump は **リリース対象の feature ブランチ上で行い、Release PR に含める**（main へ直接コミットしない）。

```bash
# package.json のみ更新（タグは打たない）。VERSION は上記ルールで決定
npm version ${VERSION} --no-git-tag-version
git commit -am "chore(release): v${VERSION} へ version bump"
```

タグ作成・push・GitHub Release（タグ push で自動作成）を含む完全な手順は [process](./process.md) を正本とする。本ドキュメントはバージョン番号の決定ルールに専念する。

## リリースフロー

### 開発フロー

```
1. 機能開発 (feature/xxx ブランチ)
   ↓
2. feature ブランチで version bump → main へ Release PR
   ↓
3. CI・品質チェック (Quality Gate)
   ↓
4. PR マージ (merge commit / ブランチ削除) → Vercel 自動デプロイ
   ↓
5. main でタグ作成 & push
   ↓
6. GitHub Release 自動作成 → 詳細ノート反映
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
