# AGENTS.md

このファイルは OpenAI Codex のクラウドコードレビュー（PR への `@codex review`）専用のレビュー規則。Codex はレビュー専任で、実装は行わない。実装・運用の正本ガイダンスは `CLAUDE.md` と `.claude/rules/` にある（レビューで規約の根拠を確認したい時だけ参照する）。

## Code Review Rules

レビューコメントは日本語で書く。指摘には現実的な failure scenario を添え、P1（本番でユーザーに対して壊れる）/ P2（エッジケース・改善）の優先度を付ける。

最優先で検出するもの:

- **正当性**: データ整合性の破壊、race condition、rollback 不能な migration、既存挙動の regression、timezone / day boundary / 過去・未来ブロックの境界処理ミス
- **セキュリティ**: RLS / 認可境界の欠落、`protectedProcedure` であるべき tRPC が `publicProcedure` になっている、secret / token の client 露出、未検証のユーザー入力・webhook（署名 / replay / idempotency）
- **課金**: Stripe webhook の冪等性欠落、二重課金、silent grant、trial / free tier の境界日処理

規約違反として指摘するもの（正本: `.claude/rules/`）:

- `as any` の使用（variance の逃げは `as never`）、本番コードに残る `console.log`（構造化ログは `@/lib/logger`）
- サーバーデータを tRPC / TanStack Query を通さずに扱う
- Tailwind semantic token を使わない直接色・任意 spacing・style 属性
- feature 間の直接 import（Composition Layer / feature barrel を通す）、`features/ -> lib/` の依存方向の逆流
- UI 文言のハードコード（next-intl の翻訳キーを使う）
- default export（App Router の特殊ファイル以外）

指摘しないもの:

- スタイル・可読性の好み
- PR の大きさ（機能のまとまり単位で束ねるのが標準運用）
- 「ついで refactor」の提案（YAGNI を優先する）
