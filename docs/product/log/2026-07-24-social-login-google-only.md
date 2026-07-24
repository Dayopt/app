---
status: frozen
date: 2026-07-24
---

# ソーシャルログインは Google のみにする（Apple / Meta 不採用、マジックリンク見送り）

## 背景・当時の前提

- 認証の本番対応レビュー（2026-07-24）で、ログイン UI に Google / Apple / Meta の 3 ボタンが並んでいたが、実際に本番で使える provider は 1 つも確定していなかった
- Apple: Sign in with Apple には Apple Developer Program（年 $99）への加入が必須。未加入
- Meta: Facebook Login はメール取得権限のためのアプリ審査（場合によりビジネス認証）が必要。UI 上のボタンは「Supabase 未対応」という誤ったコメント付きで disabled のまま露出していた
- マジックリンク: メールテンプレート（`MagicLinkEmail.tsx`）だけ存在し、アプリ側に `signInWithOtp` の入口 UI は無い

## 決定と理由

- **ソーシャルログインは Google のみ**とする。個人ユーザー向けには email+password と Google でカバーできる
- Apple は不採用。有料 Program に費用を払わない（Tomoya 判断）。Web のみの提供なので App Store の Sign in with Apple 必須要件も適用されない
- Meta は不採用。審査・維持コストが見込みユーザー獲得に見合わない
- マジックリンクは見送り。テンプレートは無害なので残置し、UI は実装しない
- 本番の Google provider 設定は Supabase Dashboard を正本とする（GitHub integration の Deploy to production は Auth 設定を本番へ同期しない）

## 却下した選択肢と、なぜ捨てたか

- **Apple ボタンを disabled で残す / feature flag で隠す**: 押せないボタンや死んだコードを本番 UI・コードベースに残す理由がない。将来採用するなら小さな追加実装で戻せる
- **Meta 実装**: Meta 開発者アプリ + 審査待ち（数日〜数週間）のコストが過大
- **パスワードレス（マジックリンク）併設**: email+password / Google と役割が重複し、導線が増えるだけ

## 影響・やること

- ログイン / サインアップ UI から Apple / Meta ボタンを撤去し、Google をフル幅ボタン化（実施済み、`claude/auth-production-hardening`）
- 設定画面の「ソーシャルログイン連携」セクション（全 provider disabled + 準備中）を削除（#1482 のソーシャル部分を吸収）
- `supabase/config.toml` の `[auth.external.apple]` ブロックを削除
- 残タスク: GCP Console での OAuth client 作成と Supabase Dashboard への Google provider 設定（本番）
