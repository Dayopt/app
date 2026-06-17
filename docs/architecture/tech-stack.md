import { Meta } from '@storybook/blocks';

# 技術スタック決定事項

## フロントエンド

### 採用技術

- **Next.js (App Router)** - React フレームワーク
- **Tailwind CSS + shadcn/ui** - スタイリング
- **状態管理** - 必要に応じて選定

### 理由

- App Routerによる最新のNext.js機能活用
- shadcn/uiによる一貫したUI設計
- Tailwindによる効率的なスタイリング

## バックエンド

### 採用技術

- **Supabase (PostgreSQL)** - データベース・BaaS
- **Clerk** - 認証サービス
- **Supabase Storage** - ファイルストレージ

### API設計

- APIルート経由 または tRPC

### 理由

- Supabaseによるフルマネージドデータベース
- Clerkによる堅牢な認証機能
- PostgreSQLによる高性能データ処理

## ホスティング・デプロイ

### 採用技術

- **Vercel** - ホスティングプラットフォーム
- **GitHub連携** - CI/CD

### 理由

- Next.jsとの最適な統合
- 自動デプロイによる開発効率向上
- エッジ配信による高速なパフォーマンス

## アーキテクチャ概要

```
Frontend (Next.js + Tailwind + shadcn/ui)
↓ API Routes / tRPC
Backend (Supabase + Clerk)
↓ Deploy
Hosting (Vercel + GitHub Actions)
```
