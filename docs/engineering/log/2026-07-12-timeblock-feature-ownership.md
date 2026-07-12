---
status: current
updated: 2026-07-12
---

# ADR-027: Plan / Record のコード所有境界を timeblock feature に統一する

time-model-split の runtime cutover 後も、Plan / Record と統計実装は旧 `features/entry` 配下に残っていた。旧 Entry CRUD の撤去に合わせ、コードの所有境界を現行モデルへ揃える。

## 決定

- `features/entry` を `features/timeblock` へ改名し、Plan / Record の editor、card、hook、service、domain 型を同じ feature が所有する
- tRPC の公開 namespace は `plans` / `records` / `statistics` に分ける
- Plan / Record を材料にする時間統計は `timeblock/server` に置く。Review は表示と解釈を所有し、DB 集計を持たない
- 物理 DB `logs` は Step 9b まで persistence adapter の実装詳細とし、アプリの公開用語には使わない

## 理由

- Plan と Record は別 entity だが、Calendar 上では同じ Timeblock editor、配置、重なり判定、差分計算を共有する
- statistics は plans と records の両方を読むため、どちらか片方や Review に置くと依存方向が不自然になる
- 旧 Entry feature 名を残すと、廃止済みの単一 entity が canonical に見え続ける

## 却下した選択肢

- `features/plans` と `features/records` に分割する案。共有 editor と Calendar interaction の所有先が曖昧になり、feature 間結合が増える
- statistics を Review に移す案。Review 以外のタグ統計や作成時フィードフォワードから再利用しにくい
- 独立 `features/statistics` を新設する案。現時点では Timeblock 以外のデータ源がなく、新しい top-level feature を正当化しない

## 影響

- #1543 の stats 所属判断は本 ADR と Step 9a の実装で解消する
- #1524 / #1528 は Step 9a merge 後に `features/timeblock` 前提で対象 path と受け入れ条件を見直す
- DB object の Record rename と entries drop は #1579 / #1580 で段階実施する
