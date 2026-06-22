# Dayopt Glossary — UI 用語集

Dayopt の UI で使う言葉の正解一覧。翻訳ファイル（messages）を編集する際は必ずここを確認する。

**関連ドキュメント**:

- コードモデルの定義 → [`docs/architecture/domain-glossary.md`](../architecture/domain-glossary.md)
- 禁止表記の一覧 → [`docs/glossary/forbidden-terms.md`](./forbidden-terms.md)
- 実装ガイド → [`docs/guides/i18n.md`](../guides/i18n.md)

---

## 凡例

| 列         | 説明                                            |
| ---------- | ----------------------------------------------- |
| Concept    | コードベース内の概念名（英語）                  |
| ja         | UI で使う日本語表記（確定）                     |
| en         | UI で使う英語表記（確定）                       |
| UIでの使い方 | どんな文脈で使うか                            |
| 禁止表記   | 使ってはいけない代替表現                        |
| 移行状況   | 現在のメッセージファイルとの差分               |

---

## 主要用語

| Concept | ja | en | UIでの使い方 | 禁止表記 | 移行状況 |
|---------|----|----|-------------|---------|---------|
| entry | エントリ | Entry | 計画・記録を持つ時間ブロック | タスク, ブロック（単独）| 一部 `タスク` 表記が残存（calendar.json, navigation.json）|
| plan (record side) | 予定 | Plan | エントリの計画側の時間 | 計画（名詞）| — |
| record | 記録 | Record | 実際に発生した時間（UI 表示） | — | — |
| actual | 実績 | Actual | DB/API 寄りの技術用語。**UI では原則「記録」を使う** | — | calendar.json に混在（技術的文脈では許容）|
| tag | タグ | Tag | 1エントリ1タグで分類する属性 | ラベル, カテゴリ | contact.json に `カテゴリ` が残存 |
| review | 振り返り | Review | ページ名・機能名 | レビュー | — |
| account | アカウント | Account | 設定ページ名 | 設定（ページ名として） | — |
| sign in | サインイン | Sign in | 認証アクション | ログイン | 移行中（auth.json, navigation.json が `ログイン` を使用）|
| sign out | サインアウト | Sign out | 認証解除アクション | ログアウト | 移行中（auth.json, navigation.json が `ログアウト` を使用）|
| timebox | タイムボックス | Timebox | 時間を区切って作業する手法（説明文脈） | — | — |

---

## 詳細ノート

### entry / エントリ

DB の `entries` テーブルに対応する中心モデル。計画（予定）と記録の両側を持つ。

- UI: 「エントリ」
- 禁止: 「タスク」（GTD 文脈の作業リスト項目と混同する）、「イベント」（カレンダーの外部 event と混同する）
- ただし **外部カレンダー連携の文脈**では「イベント」が正しい場合がある（Google Calendar の event = イベント）

### actual / 実績

DB の `actual_start` / `actual_end` カラム名、および計算値の技術用語。

- UI 表示では原則「記録」に揃える
- **「予定と実績の比較」のような UI 文言では「実績」は許容**（比較コンテキストで「記録」にすると「予定と記録」となり読みにくい）
- コードコメント・変数名では `actual` / `実績` を使い続けてよい

### sign in / サインイン（移行中）

現状: auth.json と navigation.json が「ログイン/ログアウト」を使用している。

新規追加するキーは「サインイン/サインアウト」を使う。既存キーはまとめて Phase 2（messages 整理）で移行する。

---

## 確認コマンド

```bash
# 禁止表記が messages に含まれていないか確認
pnpm copy:check
```
