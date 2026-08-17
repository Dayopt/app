---
status: frozen
date: 2026-08-17
---

# Auth 設定変更の実地検証結果（signup / email_change / Google ログイン / narrow pair OAuth）

[2026-07-27-supabase-auth-production-config.md](2026-07-27-supabase-auth-production-config.md) の「未確認・残タスク」を消し込む実地検証の結果記録（[#1796](https://github.com/Dayopt/dayopt/issues/1796)）。あわせて、production 復旧後に再実施した外部カレンダー連携の narrow scope OAuth 確認（[#1963](https://github.com/Dayopt/dayopt/issues/1963)）も同日の検証としてここに記録する。

## signup 確認メール

新規登録で signup 確認メールが実際に届くことをテスト済み（#1796 チェックリスト内でクローズ済み項目）。

## email_change（メールアドレス変更）

- **2026-08-12 実測**: 送信の実走で、確認メールは変更先アドレスへ届くことを確認。ただしリンクの着地がログイン画面に弾かれる bug を発見し、[#1956](https://github.com/Dayopt/dayopt/issues/1956)（P2）へ起票
- **2026-08-13 実測（User 実測、#1956 修正後の再実走）**: 旧・新双方へ確認メールが到達し、双方のリンク踏破で変更が完了した（Secure Email Change の仕様どおり）
- この検証で体験した「双方確認」の UX 摩擦を受けて、フローを「パスワード再認証 + 新アドレスのみ確認」へ切り替える別 issue を起票済み（変更自体は #1796 の scope 外、検証のみの規約に従う）

## Google ログイン

**2026-08-17 実測（検証レーン Sonnet + User）**: production（app.dayopt.app）で実挙動を確認した。

- ログイン画面「Googleでログイン」→ アカウント選択（tomoya.tanaka.work@gmail.com）→ 同意 → `/ja/week` へ正常にリダイレクトし、左下に表示名「田中智也」でログイン状態を確認
- Turnstile / redirect allowlist / Google provider 設定はいずれも問題なく機能した

これで #1796 のチェックリスト 3 項目（signup 確認メール / email_change / Google ログイン）はすべて実地検証済みとなった。

## 外部カレンダー連携 narrow scope OAuth（#1963 5-2(b) 再実施）

**2026-08-17 実測（production 復旧後 [PR #2125](https://github.com/Dayopt/dayopt/pull/2125) merge・main `5a1d66eff` 反映後、検証レーン Sonnet + User）**: narrow pair（`calendar.calendarlist.readonly` + `calendar.events.readonly`）への scope 縮小が production で正常動作することを確認した。

1. 設定 → 連携 → 「接続を解除」で旧・広い `calendar.readonly` 接続を切断
2. 「Google アカウントを接続」で OAuth フローを再開始
3. 認可リクエスト URL の scope パラメータが narrow pair（`openid+email+https://www.googleapis.com/auth/calendar.calendarlist.readonly+https://www.googleapis.com/auth/calendar.events.readonly`）に変わっていることを確認。旧 `calendar.readonly` は含まれない
4. 同意画面で narrow pair が個別の granular consent 2 項目（「登録している Google カレンダーの一覧の参照です」「すべてのカレンダーの予定を表示です」）として表示されることを確認。production stale 時は `calendar.readonly` 1 項目のみの表示だったのと明確に異なる
5. 両方にチェックして続行 → Dayopt へリダイレクト、接続完了を確認
6. 設定画面でカレンダー一覧（日本の祝日 / メインカレンダー）を取得、メインを選択して同期 → 成功、最終同期時刻が更新

**判定**: green。narrow pair OAuth・接続・カレンダー一覧取得・同期のすべてが production で正常動作する。

## 残タスク

- なし。[2026-07-27-supabase-auth-production-config.md](2026-07-27-supabase-auth-production-config.md) の残タスクはすべて本ログで消し込み済み
