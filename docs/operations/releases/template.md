---
status: current
last_verified: 2026-06-17
---

# Release vX.Y.Z

**リリース日**: YYYY-MM-DD
**バージョン**: X.Y.Z

## 🎯 概要

このリリースの主な変更点を簡潔に記載（前回リリースからの全変更を網羅）

---

## 📋 変更内容

**⚠️ 重要**: 前回リリース（v{前バージョン}）から今回リリース（v{今回バージョン}）までの**全てのPR**を網羅して記載すること。リリースPR単体の変更だけでなく、期間中にマージされた全PRの内容を反映する。

### ✨ 新機能 (Added)

- **機能名** ([#PR番号](https://github.com/Dayopt/dayopt/pull/{PR番号}))
  - 詳細説明

### 🔄 変更 (Changed)

- **変更内容** ([#PR番号](https://github.com/Dayopt/dayopt/pull/{PR番号}))
  - 詳細説明

### 🐛 バグ修正 (Fixed)

- **修正内容** ([#PR番号](https://github.com/Dayopt/dayopt/pull/{PR番号}))
  - 詳細説明

### ⚠️ 破壊的変更 (Breaking Changes)

- 破壊的変更がある場合、詳細に記載
- マイグレーション手順も記載

### 🗑️ 削除 (Removed)

- **削除内容** ([#PR番号](https://github.com/Dayopt/dayopt/pull/{PR番号}))
  - 削除された機能や非推奨になった機能

### ⚡ パフォーマンス (Performance)

- **改善内容** ([#PR番号](https://github.com/Dayopt/dayopt/pull/{PR番号}))
  - 詳細説明

### 🔒 セキュリティ (Security)

- **対応内容** ([#PR番号](https://github.com/Dayopt/dayopt/pull/{PR番号}))
  - セキュリティ関連の修正

---

## 🔗 関連リンク

### Pull Requests

**⚠️ 重要**: 前回リリースから今回リリースまでの**全てのPR**をリストアップすること。

```bash
# 前回リリース以降のPR一覧を取得
gh pr list --state merged --base main --search "merged:>=YYYY-MM-DD" --json number,title --jq '.[] | "- [#\(.number)](https://github.com/Dayopt/dayopt/pull/\(.number)) - \(.title)"'
```

- [#PR番号](https://github.com/Dayopt/dayopt/pull/{PR番号}) - {PR説明}
- [#PR番号](https://github.com/Dayopt/dayopt/pull/{PR番号}) - {PR説明}
- ...（前回リリース以降の全PRを記載）

---

**Full Changelog**: https://github.com/Dayopt/dayopt/compare/v{前バージョン}...v{今回バージョン}

**🤖 Generated with [Claude Code](https://claude.com/claude-code)**

**Co-Authored-By: Claude `<noreply@anthropic.com>`**

---

## 📝 このテンプレートについて

このファイルは **AIがリリースノートを記載する際の構造テンプレート** です。

### 使い方

1. `gh release edit` で GitHub Release に直接反映する際、このファイルの構造を参考にする
2. リポジトリにリリースノートファイルをコミットする必要はない
3. 反映先は GitHub Release ページ

### リリースノートの品質基準

- [ ] 前回リリース以降の**全てのPR**が含まれている
- [ ] 各PRにリンクが付いている
- [ ] カテゴリ別に整理されている（Added, Changed, Fixed, etc.）
- [ ] Full Changelogリンクが正しい
- [ ] バージョン番号が正しい

---

**種類**: 📙 リファレンス
**最終更新**: 2026-02-17
**所有者**: Dayopt 開発チーム
