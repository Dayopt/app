---
status: frozen
date: 2026-07-27
code:
  - apps/web/content/docs
  - apps/web/scripts/validate-content.js
---

# 公開 docs が未実装機能を約束していた（実装との突き合わせ監査）

## 背景・当時の前提

#1691（公開中の日本語 docs に他プロダクトの雛形が混入）の対応を始める際、issue が名指しした 3 ファイルのうち 2 つは PR #1717 で既に削除済み、リンク切れも 0 件だった。残った `ja/plan/calendar.mdx` を書き直すために apps/product の実装を読んだところ、**issue が挙げていない箇所に、より広範な虚偽記述**が見つかった。

そこで公開中の docs 全ページを実装と突き合わせた。en 側にも同じ記述が入っていたため、両ロケールを対象にした。

## 監査結果

`apps/product` のコード・DB schema・i18n メッセージを一次情報として照合した。

| docs の主張                          | 実際           | 根拠                                                                                  |
| ------------------------------------ | -------------- | ------------------------------------------------------------------------------------- |
| Energy Mapping                       | 存在しない     | repo 全体で 0 hit                                                                     |
| AI Reflection                        | 存在しない     | LLM 連携なし。`lib/mcp/auth.ts` の Claude 参照は MCP **client** 側                    |
| プロジェクト管理（Free 最大 3）      | 存在しない     | `project_id` 0 hit、テーブルなし                                                      |
| Google カレンダー双方向同期          | 読み取り専用   | `GOOGLE_CALENDAR_READONLY_SCOPE = 'calendar.readonly'`                                |
| リマインダー（6 段階）               | 存在しない     | `plans` に列なし、Inspector に field なし。migration は `_archive/` の旧 tickets 由来 |
| 繰り返しプラン                       | 存在しない     | recurrence は Google 取り込みの parse のみ                                            |
| 通知機能                             | 存在しない     | push 実装 0 hit                                                                       |
| ゴミ箱（30 日保持）                  | 存在しない     | soft delete + 直後の「元に戻す」のみ。30 日はアカウント削除の猶予期間                 |
| API から作成・更新                   | 読み取り専用   | MCP tool は `description` に "Read-only."、iCal feed は GET のみ                      |
| API は Free から利用可               | Pro のみ       | marketing pricing の Pro highlights                                                   |
| 1GB / 100GB ストレージ               | 存在しない     | 容量の概念なし                                                                        |
| 優先サポート / コミュニティ          | 存在しない     | entitlement は `pro_access` のみ。community リンクなし                                |
| `N` = 新規作成                       | 存在しない     | 実物は `C` / `Shift+C`                                                                |
| 月表示                               | 存在しない     | `CalendarViewType = 'day' \| 'week' \| '2day'..'7day'`                                |
| プランに複数タグ                     | 1 件のみ       | `plans.tag_id: string \| null`                                                        |
| Accuracy Score                       | 名称が違う     | 実物は `estimationAccuracy`（`MetricId` の 6 指標の 1 つ）                            |
| 返金「ご満足いただけない場合は返金」 | 日割り返金なし | `legal.refund` と矛盾していた                                                         |

`ja/getting-started/index.mdx` は en ファイルとバイト単位で同一だった。`/ja/docs` のランディングページが全部英語で表示されていた。

## なぜ起きたか

- 初期の docs が実装より先に、あるいはテンプレートを下敷きに書かれ、その後の実装変更に追随していない
- `apps/web/scripts/validate-content.js` は事故の再発防止で書かれていたが、**どの workflow からも呼ばれていなかった**（`apps/web/package.json` に script 定義があるだけ）
- i18n メッセージにも旧 tickets モデル時代の reminder / recurrence 文字列が残骸として残っており、grep だけでは「実装がある」と誤認しうる。テーブル定義と Inspector の field 構成まで見ないと判定できない

## 対応

- 存在しない機能の記述を en / ja 両方から削除した（ロードマップとしても残さない方針）
- `ja/plan/calendar.mdx` と `plans.mdx` を実装に合わせて書き直し、en 版も揃えた
- `ja/getting-started/index.mdx` を日本語化した
- 用語を `docs/product/glossary.md` に合わせた（プラン → 予定、Record → 記録、タスク → ブロック）
- `.github/workflows/docs-guard.yml` に `validate:content` を接続した

## 次に同じことを調べる人へ

機能の有無を判定するときの一次情報の優先順位:

1. `apps/product/src/lib/database/generated/database.types.ts` のテーブル列
2. feature の component / hook 構成（例: Inspector の field は `features/timeblock/components/inspector/fields/`）
3. `apps/product/messages/*/` の UI 文字列 — **ただし残骸が残る**。1 と 2 で裏を取る
4. `apps/web/messages/*/marketing.json` の pricing — Free / Pro の線引きはここが正本

`supabase/migrations/_archive/` にしか無い機能は、既に廃止されている。
