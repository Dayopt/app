# パフォーマンスガイド

Dayopt Webプロジェクトのパフォーマンス最適化ガイドラインです。

## 概要

### パフォーマンスアーキテクチャ

- **バンドル分析**: ベンダーチャンク分割を含むWebpackバンドルアナライザー
- **画像最適化**: WebP/AVIF形式とレスポンシブサイズ対応
- **フォント読み込み**: Interフォントバリアントのプリロード
- **コード分割**: 非クリティカルコンポーネントの動的インポート
- **Core Web Vitals**: リアルタイム監視と最適化

## パフォーマンス要件

### Core Web Vitals目標

| 指標 | 目標値  | 説明                                             |
| ---- | ------- | ------------------------------------------------ |
| LCP  | < 2.5秒 | Largest Contentful Paint（最大コンテンツの描画） |
| FID  | < 100ms | First Input Delay（初回入力遅延）                |
| CLS  | < 0.1   | Cumulative Layout Shift（累積レイアウトシフト）  |

### その他の指標

- **FCP (First Contentful Paint)**: < 1.8秒
- **TTI (Time to Interactive)**: < 3.8秒
- **TTFB (Time to First Byte)**: < 600ms

## 最適化戦略

### 1. 画像最適化

#### next/imageの使用

```typescript
import Image from 'next/image'

// ✅ 推奨: next/image使用
<Image
  src="/images/hero.jpg"
  alt="ヒーロー画像"
  width={1200}
  height={600}
  priority  // LCP対策
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
/>

// ❌ 禁止: imgタグ直接使用
<img src="/images/hero.jpg" alt="ヒーロー画像" />
```

#### 画像フォーマット

- **WebP**: 写真・複雑な画像用（最大30%サイズ削減）
- **AVIF**: 最新ブラウザ向け（最大50%サイズ削減）
- **SVG**: アイコン・ロゴ・シンプルな図形用

#### 画像サイズガイドライン

| 用途         | 推奨サイズ  | フォーマット |
| ------------ | ----------- | ------------ |
| ヒーロー画像 | 1920×1080px | WebP/AVIF    |
| ブログカバー | 1200×630px  | WebP         |
| サムネイル   | 400×300px   | WebP         |
| アイコン     | 48×48px     | SVG          |

### 2. コード分割

#### 動的インポート

```typescript
import dynamic from 'next/dynamic'

// 非クリティカルコンポーネントの遅延ロード
const SearchDialog = dynamic(
  () => import('@/components/search/SearchDialog'),
  {
    ssr: false,
    loading: () => <div className="h-10 w-32 bg-muted animate-pulse rounded" />
  }
)

// 重いライブラリの遅延ロード
const Chart = dynamic(
  () => import('recharts').then((mod) => mod.LineChart),
  { ssr: false }
)
```

#### Tree-shakeableインポート

```typescript
// ✅ 推奨: 必要な関数のみインポート
import { format, parseISO } from 'date-fns';

// ❌ 禁止: 全体インポート
import * as dateFns from 'date-fns';
```

### 3. フォント最適化

#### next/fontの使用

```typescript
// src/app/layout.tsx
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap', // FOIT防止
  preload: true,
  variable: '--font-inter',
});
```

#### フォント戦略

- **display: swap**: 即座にフォールバックフォントを表示
- **preload**: クリティカルフォントのプリロード
- **subset**: 必要な文字セットのみ読み込み

### 4. バンドル最適化

#### バンドル分析

```bash
# バンドルサイズ分析
npm run analyze
```

#### チャンク分割設定

```javascript
// next.config.js
module.exports = {
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
  webpack: (config) => {
    config.optimization.splitChunks = {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
      },
    };
    return config;
  },
};
```

### 5. キャッシング戦略

#### 静的アセット

- `/_next/static/*`: 1年間キャッシュ（ファイルハッシュ付き）
- `/images/*`: 30日間キャッシュ
- `/fonts/*`: 1年間キャッシュ

#### APIルート

```typescript
// キャッシュヘッダー設定
export async function GET() {
  return Response.json(data, {
    headers: {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
```

### 6. レンダリング最適化

#### Server Componentsの活用

```typescript
// ✅ 推奨: Server Components（デフォルト）
export default async function Page() {
  const data = await fetchData()  // サーバーサイドで実行
  return <div>{data}</div>
}

// ⚠️ 必要な場合のみClient Components
'use client'
export function InteractiveComponent() {
  const [state, setState] = useState()
  return <button onClick={() => setState(...)}>Click</button>
}
```

#### SSG（Static Site Generation）

```typescript
// 静的生成（ビルド時）
export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

// ISR（Incremental Static Regeneration）
export const revalidate = 3600; // 1時間ごとに再生成
```

## ビルド・デプロイ

### プラットフォーム

Vercelデプロイに最適化されています。

### 環境別設定

| 環境         | 最適化                             |
| ------------ | ---------------------------------- |
| 開発         | ホットリロード優先、最小限の最適化 |
| ステージング | 本番に近い最適化、デバッグ情報あり |
| 本番         | フル最適化、圧縮、ミニファイ       |

### キャッシング

- 静的アセットの戦略的キャッシュ
- APIルートの適切なキャッシュヘッダー

## 監視

### 組み込みアナリティクス

```typescript
// Web Vitals監視
import { useReportWebVitals } from 'next/web-vitals';

export function WebVitals() {
  useReportWebVitals((metric) => {
    console.log(metric);
    // アナリティクスサービスに送信
  });
}
```

### パフォーマンストラッキング

- Lighthouseスコアの定期測定
- Core Web Vitalsの継続監視
- バンドルサイズの変化追跡

## チェックリスト

### 開発時

- [ ] next/imageを使用しているか
- [ ] 不要なClient Componentsがないか
- [ ] 動的インポートを活用しているか
- [ ] Tree-shakeableインポートを使用しているか

### デプロイ前

- [ ] `npm run analyze`でバンドルサイズ確認
- [ ] Lighthouseスコア90以上
- [ ] Core Web Vitals目標達成
- [ ] 画像最適化確認

### 定期レビュー

- [ ] 週次: バンドルサイズ確認
- [ ] 月次: Lighthouse監査
- [ ] 四半期: 全体パフォーマンスレビュー

---

**最終更新**: 2025年1月
