# リリース管理

このディレクトリには、Dayoptの各バージョンのリリースノートとバージョニング管理に関するドキュメントが含まれています。

## ⚠️ リリース作業を行う前に必読

**🎯 [checklist](./checklist.md) - リリース作業チェックリスト**

リリース作業を行う際は、**必ずこのチェックリストを上から順に確認**してください。
このチェックリストに従うことで、以下のような重大なミスを防止できます：

- ❌ 既存のバージョンタグを上書きしてしまう
- ❌ package.json のバージョン更新を忘れる
- ❌ Full Changelog リンクを含め忘れる
- ❌ CI/CD チェックをスキップしてしまう

## 📁 ファイル構成

```
docs/releases/
├── README.md              # このファイル
├── RELEASE_CHECKLIST.md   # 【必読】リリース作業チェックリスト
├── RELEASE_PROCESS.md     # リリースプロセス詳細
├── VERSIONING.md          # バージョニング管理ガイド
└── template.md            # リリースノートテンプレート
```

## 📋 最新リリース

最新のリリース情報は [GitHub Releases](https://github.com/Dayopt/dayopt/releases) で確認できます。

リリースノート本体は、プロジェクトルートの `RELEASE_NOTES_v*.md` ファイルに記載されています。

## 🚀 新しいリリースを作成する手順

**⚠️ 重要**: リリース作業を行う前に、必ず [checklist](./checklist.md) を開いて、上から順番に全ての項目を確認してください。

### クイックリファレンス

1. **[checklist](./checklist.md) を開く**（必須）
2. **Phase 0**: リリース準備（バージョン番号確認、package.json更新、リリースノート作成）
3. **Phase 1**: PRマージ（全CI/CDチェック通過確認）
4. **Phase 2**: リリースタグ作成（自動GitHub Release）
5. **Phase 3**: デプロイ確認（Vercel）
6. **Phase 4**: リリース後の作業（ドキュメント更新、通知）

詳細な手順とコマンドは [checklist](./checklist.md) を参照してください。

## 📖 関連ドキュメント

- **[checklist](./checklist.md)** - 【必読】リリース作業チェックリスト
- [process](./process.md) - リリースプロセスの詳細説明
- [versioning](./versioning.md) - 詳細なバージョニングガイド
- [template](./template.md) - リリースノートテンプレート

## 🔗 外部リンク

- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [GitHub Releases](https://github.com/Dayopt/dayopt/releases)

## 📝 バージョニングルール

Dayoptは **Semantic Versioning 2.0.0** に準拠しています。

### バージョン形式: `X.Y.Z`

- **MAJOR (X)**: 破壊的変更
- **MINOR (Y)**: 新機能追加（後方互換性あり）
- **PATCH (Z)**: バグ修正（後方互換性あり）

詳細は [versioning](./versioning.md) を参照してください。

---

**種類**: 📙 リファレンス
**最終更新**: 2025-12-11
**所有者**: Dayopt 開発チーム
