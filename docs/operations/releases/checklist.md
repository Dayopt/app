---
status: current
last_verified: 2026-06-17
---

# リリースチェックリスト

このチェックリストは、**リリース作業時に必ず確認すべき項目**をまとめたものです。
リリースの度に、このファイルを開いて、上から順に確認してください。

## 🎯 このドキュメントの使い方

1. **リリース作業開始前に、このファイルを必ず開く**
2. **上から順番に、各項目を確認する**
3. **全ての項目が✅になったら、次のステップに進む**
4. **問題があれば、必ず修正してからリリースする**

---

## 📋 Phase 0: リリース準備（featureブランチで実施）

### 0.1 バージョン番号の確認

- [ ] **リリースするバージョン番号を決定**
  - PATCH: バグ修正のみ（例: 0.16.0 → 0.16.1）
  - MINOR: 新機能追加（例: 0.16.0 → 0.17.0）
  - MAJOR: 破壊的変更（例: 0.16.0 → 1.0.0）

  ```bash
  # 今回のリリースバージョン（例）
  VERSION="0.17.0"
  ```

- [ ] **既存のリリースタグと重複していないことを確認**

  ```bash
  # 既存のリリースを確認
  gh release list

  # 確認: v${VERSION} が既に存在しないこと
  gh release view v${VERSION} 2>/dev/null && echo "❌ Already exists!" || echo "✅ OK"
  ```

### 0.2 package.json バージョン更新

- [ ] **リリース前の最後のPRにversion bumpを含める**

  ```bash
  npm version ${VERSION} --no-git-tag-version
  # → コミットに含める
  ```

  **ポイント**: タグ打ち前にmainのpackage.jsonが正しい状態になるため、リリース後の後片付けが不要。

### 0.3 コード品質の確認

- [ ] **Lintチェック**

  ```bash
  npm run lint
  ```

- [ ] **型チェック**

  ```bash
  npm run typecheck
  ```

- [ ] **テスト**

  ```bash
  npm run test:run
  ```

- [ ] **ビルド**
  ```bash
  npm run build
  ```

→ **PRをマージしてからPhase 1へ**

---

## 📋 Phase 1: タグ作成・リリース

### 1.1 mainブランチの最新を取得

- [ ] **mainブランチに切り替えて最新を取得**

  ```bash
  git checkout main
  git pull origin main
  ```

### 1.2 Gitタグの作成とプッシュ

- [ ] **Gitタグを作成してプッシュ**

  ```bash
  # タグを作成
  git tag v${VERSION}

  # タグをプッシュ
  git push origin v${VERSION}
  ```

### 1.3 GitHub Actions の自動実行を確認

タグpushにより以下が自動実行される：

- [ ] **本番デプロイ（Vercel）が成功**

  ```bash
  gh run list --workflow=create-release.yml --limit 1
  gh run watch
  ```

- [ ] **GitHub Releaseが自動作成された**

  ```bash
  gh release view v${VERSION}
  ```

---

## 📋 Phase 2: リリースノート反映

### 2.1 前回リリース以降の全PRを取得

- [ ] **全PRを取得**

  ```bash
  # 前回リリースのタグを確認
  git tag --sort=-creatordate | head -5

  # 前回リリース以降のPR一覧を取得
  gh pr list --state merged --base main --limit 100 --json number,title,mergedAt \
    | jq -r '.[] | select(.mergedAt > "YYYY-MM-DDT00:00:00Z") | "- [#\(.number)](https://github.com/Dayopt/dayopt/pull/\(.number)) - \(.title)"'
  ```

### 2.2 詳細なリリースノートを作成

- [ ] **`docs/releases/template.md` の構造を参考にリリースノートを作成**
  - [ ] 前回リリース以降の**全てのPR**が含まれている
  - [ ] 各PRにリンクが付いている
  - [ ] カテゴリ別に整理されている（Added, Changed, Fixed, Performance, Breaking Changes）
  - [ ] **Full Changelogリンクが含まれている**
    ```markdown
    **Full Changelog**: https://github.com/Dayopt/dayopt/compare/v{前バージョン}...v{今回バージョン}
    ```
  - [ ] 破壊的変更・データモデル変更を明記
  - [ ] 削除されたコンポーネント/機能をリスト

### 2.3 GitHub Release に反映

- [ ] **リリースノートを GitHub Release に直接反映**

  ```bash
  # 一時ファイルにリリースノートを書き出してから反映
  gh release edit v${VERSION} --notes-file /tmp/release-notes-v${VERSION}.md
  ```

- [ ] **リリースページで確認**

  ```bash
  gh release view v${VERSION} --web
  ```

  - [ ] バージョン番号が正しい
  - [ ] リリースノートが正しく表示されている
  - [ ] Full Changelogリンクが機能している

---

## 📋 Phase 3: リリース後作業

### 3.1 デプロイ確認

- [ ] **本番環境で動作確認**
  - [ ] サイトが正常に表示される
  - [ ] 新機能が動作する
  - [ ] 既存機能が正常に動作する

### 3.2 監視・モニタリング

- [ ] **Sentryでエラー監視**
  - エラーが急増していないことを確認

### 3.3 OSSライセンス情報の更新

- [ ] **ライセンス情報を再生成**
  ```bash
  npm run generate-licenses
  ```
- [ ] **生成物をマーケティングサイト（web）に反映**
  - `public/legal/oss-credits.json` を web リポジトリへコピー

### 3.4 通知・関連Issue

- [ ] **関連Issueにコメント**
  ```bash
  gh issue comment {issue番号} \
    --body "Released in v${VERSION}: https://github.com/Dayopt/dayopt/releases/tag/v${VERSION}"
  ```

---

## ⚠️ よくある失敗と対策

### 失敗例1: 既存のリリースと重複するバージョンを作成

**対策**:

- ✅ Phase 0.1で既存リリースを確認
- ✅ `gh release view v${VERSION}` でチェック
- ✅ 既存バージョンが見つかった場合、必ず「v0.X.0じゃないですか？」と確認

### 失敗例2: リリースノートに一部のPRしか含まれていない

**対策**:

- ✅ 前回リリース以降の**全てのPR**を取得してから記載
- ✅ `gh pr list --state merged` コマンドで漏れなく取得

### 失敗例3: リリースノートが抽象的

**対策**:

- ✅ 各PRのコミットを取得して具体的な変更内容を記載
- ✅ `docs/releases/template.md` の構造を参考にする

### 失敗例4: version bump忘れ

**対策**:

- ✅ Phase 0.2でリリース前の最後のPRにversion bumpを含める
- ✅ タグ打ち前にmainのpackage.jsonが正しい状態になっていることを確認

---

## 🔗 関連ドキュメント

- [process](./process.md) - 詳細なリリースプロセス
- [versioning](./versioning.md) - バージョニングルール
- [template](./template.md) - リリースノート構造テンプレート（参照用）

---

## 📝 チェックリスト完了

全ての項目が✅になったら、リリース完了です！

**リリース実施者**: @{username}
**リリース日時**: YYYY-MM-DD HH:MM
**バージョン**: v{VERSION}
**リリースURL**: https://github.com/Dayopt/dayopt/releases/tag/v{VERSION}

---

**種類**: 📗 ハウツーガイド
**最終更新**: 2026-02-17
**所有者**: Dayopt 開発チーム
