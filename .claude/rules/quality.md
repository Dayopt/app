---
paths:
  - 'apps/product/src/**/*.{ts,tsx}'
  - 'apps/product/src/**/*.test.{ts,tsx}'
---

# 品質・テスト・パフォーマンス

## テスト

優先順位: ビジネスロジック > カスタムフック > 複雑なコンポーネント > ユーティリティ

```bash
pnpm test          # 全体実行
pnpm test -- path  # 特定ファイル
```

詳細: `.claude/skills/test/SKILL.md`

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
