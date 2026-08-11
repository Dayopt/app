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

## 条件付き skip の検証

策定日: 2026-08-11

条件付きで skip する test は、**本体が実際に走って pass する状態を一度は目視してから提出する**。全件 skip のまま緑になった test は「自動検証を足した」と言いながら何も確かめていない。前節の mock と同じ「緑が検証の証拠にならない」族で、こちらは緑ですらなく空振りしている分だけ気づきにくい。

- **`it.skipIf` / `describe.skipIf` は収集時に評価される。** 条件が module load 時に確定するもの（`process.env.USE_LOCAL_DB === 'true'` のような env 由来。既存の integration test は全てこの形）なら問題ない。**危ないのは `beforeAll` の probe で決まる変数を条件に使う場合**で、評価時点では初期値のままなので条件が常に固定される。実際に、captcha を有効にしても integration test が全件 skip され続けた（2026-08-11、PR #1950）
- probe の結果で分岐するなら**実行時 skip**（test 本体の中で判定して `ctx.skip()`）にする
- 提出前に、skip を外した状態（または条件を満たした環境）で本体が pass することを 1 回確認する。件数が `0 passed` や `N skipped` のままでないかを出力で見る

「設定がそう宣言している」ではなく「実際にその振る舞いになっている」を見る、という点は前節と同じ。

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
