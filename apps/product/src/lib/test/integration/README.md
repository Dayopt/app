# Integration Tests

このディレクトリには、Supabaseを使用した統合テストを配置します。

## 概要

統合テストは、実際のデータベース（ローカルSupabase）を使用して、
アプリケーションの各層が正しく連携していることを検証します。

## テスト対象

- **tRPC routers**: API エンドポイントの動作確認
- **Service layer**: ビジネスロジックの検証
- **RLS policies**: 行レベルセキュリティの検証
- **Database operations**: CRUD 操作の検証

## 実行方法

### ローカル

```bash
# Supabase を起動
supabase start

# 統合テストを実行
npm run test:integration
```

### CI

GitHub Actions の `ci.yml`（affected な PR のみ、integration job）で自動実行されます（#2483 で `integration.yml` から統合、#2539 で unit job から分離）。**2026-09-03 に nightly の fallback は撤去した** —— `branch:finish` の up-to-date gate により merge commit の tree は per-PR で検証済みの tree と一致するため、nightly は同じ tree を 2 度検証していた。
CI では Supabase CLI を使用してローカル環境を構築します。

## ファイル命名規則

- `*.integration.test.ts` - 統合テストファイル

## 注意事項

- テストは独立して実行可能であること
- テストデータは各テストで作成し、テスト後にクリーンアップすること
- 他のテスト（unit tests）に影響を与えないこと
