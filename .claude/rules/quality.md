---
paths:
  - 'apps/product/src/**/*.{ts,tsx}'
  - 'apps/product/src/**/*.test.{ts,tsx}'
  - 'apps/web/src/app/api/**/*.{ts,tsx}'
  - 'supabase/functions/**/*.{ts,tsx}'
---

# 品質・テスト・パフォーマンス

## テスト

優先順位: ビジネスロジック > カスタムフック > 複雑なコンポーネント > ユーティリティ

```bash
pnpm test          # 全体実行
pnpm test -- path  # 特定ファイル
```

詳細: `.claude/skills/test/SKILL.md`

## 外部 API 統合の検証

外部 API（OAuth / provider API / webhook）との統合は、**mock テストが通っただけで完了扱いにしない**。mock は実装者の仮定を写すだけで、仮定そのものの誤り（レスポンスに入るフィールド、必要な scope、エラーの形）は検出できない。

- 契約は一次資料で確認する: 公式 docs / Context7 で「このリクエストに対して実際に何が返るか」を確認してから schema と mock を書く
- 可能なら実レスポンス（またはドキュメント記載の実例）を fixture 化し、自作 mock との乖離を残さない
- 実例: Google OAuth は scope に `openid` が無いと `id_token` を返さないが、token レスポンスを丸ごと mock した unit test は 23/23 pass のまま「接続が 100% 失敗する」バグを見逃した（PR #1721）

## アクセシビリティ

- アイコンボタンに `aria-label`
- フォームで `label` 紐付け
- タッチターゲット最小 44x44px（`min-h-11 min-w-11`）
- 画像には必ず `alt`

## パフォーマンス

**p95だけを見る。平均は判断に使わない。**

| 指標            | p95目標  |
| --------------- | -------- |
| **LCP**         | <= 2.5s  |
| **INP**         | <= 200ms |
| **API latency** | <= 300ms |
| **DBクエリ**    | <= 100ms |

- p95が悪化 → Issueを作成
- 主要導線エラー率 < 0.1% を維持
