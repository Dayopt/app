---
status: frozen
date: 2026-08-14
---

# iCal feed token の回転手段は既存実装で足りており、新規機構は作らない

## 背景・当時の前提

- [#2081](https://github.com/Dayopt/dayopt/issues/2081) は PR #2080 のクロスレビュー（risk-reviewer 指摘）を受けて、「iCal feed token（URL path 内の長期 bearer credential）に回転・失効手段が無い」という前提で起票された
- レーン I（`claude/external-calendar-hardening-2079`）が実装着手前の plan 作成中にコードを確認したところ、`regenerateICalToken`（[`settings-service.ts`](../../../apps/product/src/features/settings/server/settings-service.ts)）が既に実装・UI 配線済みだった。導入元は commit `57a31c6a0`（feat(settings): iCalフィードURL管理を追加）で、`ICalFeedSettings.tsx` の「再発行」ボタンから呼ばれる
- 元の指摘は実装を実測せずに転記されたもので、指揮台（Fable）が 2026-08-14 にこの訂正を承認した

## 決定と理由

**新規のトークン管理機構は作らない。既存の rotate 機構に対する HTTP 層の contract test を追加し、410 ではなく 401 を維持する。**

1. `regenerateICalToken` は `user_settings.ical_feed_token`（UNIQUE index 付き、1 user 1 token）を新しい UUID へ直接 UPDATE する。1 行の上書きなので rotate は atomic — 旧 token は UPDATE が commit された瞬間から DB に存在しなくなり、`/api/v1/calendar/[token]/route.ts` の `getUserIdByToken` lookup が失敗する。「旧 URL の失効」はすでに成立している
2. 検証の欠落は「rotate 後に旧 token が実際に拒否されること」を HTTP 層で固定する contract test が無かった点のみ。既存の `user-settings.integration.test.ts` は service 層（token 値が変わること）しか検証していなかった。`route.test.ts` に、token→user_id の 1 行ストアを状態として共有し `SettingsService.regenerateICalToken` を実際に呼び出す 3 点 temporal assert（(1) rotate 前は旧 token で 200 (2) rotate 実行 (3) rotate 後は旧 token 401・新 token 200）を追加した。初稿は mock が静的に null を返すことで 401 を成立させていただけで rotate 自体を一度も実行しておらず、クロスレビュー指摘（risk / behavior 一致）を受けて上記の形へ修正した
3. 410（issue の当初検証基準）ではなく 401 を維持する。410 Gone は「この URL は存在したが恒久的に無くなった」ことの表明に、無効化された token を記憶する仕組み（revoked token 履歴テーブル等）を要求する。現状は 1 user 1 token を UPDATE で上書きするだけで、「一度も存在しなかった token」と「rotate 済みの旧 token」を意図的に区別しない設計になっている。区別するための履歴テーブル新設は、iCal client 側の実利（410 も 401 も「もう読めない」という結果は同じで、大半の client はエラー種別を区別した UI を持たない）に対して不釣り合いなコストで YAGNI と判断した

## 却下した選択肢と、なぜ捨てたか

- **revoked token 履歴テーブルを新設して 410 を返す** — issue の検証基準どおりだが、上記の理由で見送り。将来 iCal client 側の要件が具体化したら再検討する
- **token を URL path から query パラメータへ移す**（issue「やること 3」） — 既存 iCal client 互換を壊す不可逆変更で、issue 自身も「検討」止まり。着手しない
- **Log Drain 除外設計**（issue「やること 2」） — [#1701](https://github.com/Dayopt/dayopt/issues/1701) Phase 3 側の判断に委ねる。この issue は最初から `Refs #1701` としており、独立して意思決定すべきではない

## 影響・やること

- `route.test.ts` に、実際の `regenerateICalToken` 呼び出しを伴う rotate-then-reject の contract test を追加済み（このログと同じ PR）
- [#2081](https://github.com/Dayopt/dayopt/issues/2081) は上記 scope で Closes する
- 今後同種のクロスレビュー指摘（「既存機能が無い」という主張）は、実装着手前にコード確認を先に行う運用を継続する
