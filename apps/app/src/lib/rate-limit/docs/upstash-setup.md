# Upstash Redis セットアップガイド

Dayoptのレート制限機能をインメモリ実装からUpstash Redisに移行するためのガイドです。

## 🎯 目的

- **問題**: 現在のインメモリ実装はサーバー再起動でリセットされる
- **解決策**: Upstash Redisによる永続的なレート制限
- **メリット**:
  - サーバー再起動に影響されない
  - 複数インスタンス間で共有可能（スケーラビリティ）
  - 99.99%の可用性
  - グローバルエッジネットワークで低レイテンシ（<10ms）

## 📋 セットアップ手順

### Step 1: Upstashアカウント作成

1. **アカウント登録**:
   https://console.upstash.com/

2. **サインアップ**:
   - GitHubアカウント連携推奨
   - 無料枠: 10,000リクエスト/日（十分なスペック）

### Step 2: Redisデータベース作成

1. **Console → Create Database**をクリック
2. **設定**:

   ```
   Name: dayopt-ratelimit
   Region: Asia Pacific (Tokyo) - 東京リージョン推奨
   Type: Regional（Globalは不要）
   Eviction: No Eviction（レート制限データは自動期限切れ）
   ```

3. **作成完了後、以下が表示される**:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

### Step 3: 環境変数設定

1. **`.env.local` に追加**:

   ```env
   # Upstash Redis（レート制限）
   UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
   UPSTASH_REDIS_REST_TOKEN=AXXXXxxxxxxxxxxxxxxxxxxx
   ```

2. **Vercelの環境変数にも追加**:

   ```bash
   # Vercel CLIを使用
   vercel env add UPSTASH_REDIS_REST_URL
   vercel env add UPSTASH_REDIS_REST_TOKEN

   # または Vercel Dashboard → Settings → Environment Variables
   ```

3. **本番環境・プレビュー環境両方に設定する**

### Step 4: コード有効化

1. **`src/lib/rate-limit/upstash.ts`のコメント解除**:

   ```bash
   # AIが自動で実行します
   ```

2. **`src/app/api/middleware/rate-limit.ts`をUpstash版に置き換え**:
   ```bash
   # AIが自動で実行します
   ```

### Step 5: 動作確認

1. **ローカル環境でテスト**:

   ```bash
   PORT=4000 npm run dev
   ```

2. **レート制限のテスト**:

   ```bash
   # APIエンドポイントに連続リクエスト
   for i in {1..15}; do
     curl -i http://localhost:4000/api/v1/health
   done

   # 10リクエスト後に429エラーが返ることを確認
   ```

3. **Upstash Consoleでリクエスト数を確認**:
   - Console → Database → Analytics
   - リクエストが記録されているか確認

## 💰 コスト見積もり

### 無料枠（Free Plan）

- **10,000リクエスト/日**
- **1ヶ月で300,000リクエスト**
- Dayopt初期段階では十分

### 有料プラン（Pay-as-you-go）

- **$0.2 / 100,000リクエスト**
- Dayopt想定（DAU: 1,000ユーザー、1ユーザー100リクエスト/日）:
  ```
  100,000リクエスト/日 × 30日 = 3,000,000リクエスト/月
  コスト: 3,000,000 / 100,000 × $0.2 = $6/月
  ```
- **非常にコストパフォーマンスが高い**

## 🔧 レート制限設定

### プリセット一覧

| エンドポイント       | 制限              | 説明                   |
| -------------------- | ----------------- | ---------------------- |
| 一般API              | 60リクエスト/分   | 通常のAPI操作          |
| 認証API              | 5リクエスト/15分  | ログイン・サインアップ |
| パスワードリセット   | 3リクエスト/時間  | パスワードリセット     |
| 検索API              | 30リクエスト/分   | 検索機能               |
| ファイルアップロード | 10リクエスト/時間 | ファイルアップロード   |

### カスタム設定例

```typescript
// src/app/api/your-endpoint/route.ts
import { apiRateLimit } from '@/lib/rate-limit/upstash';

export async function POST(request: Request) {
  // レート制限チェック
  const { success, limit, remaining } = await apiRateLimit.limit(
    request.headers.get('x-forwarded-for') || 'unknown',
  );

  if (!success) {
    return new Response('Too Many Requests', {
      status: 429,
      headers: {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
      },
    });
  }

  // 処理続行
  return Response.json({ message: 'Success' });
}
```

## 🚨 トラブルシューティング

### エラー: `UPSTASH_REDIS_REST_URL is not defined`

**原因**: 環境変数が設定されていない

**解決策**:

```bash
# .env.localを確認
cat .env.local | grep UPSTASH

# なければ追加
echo "UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io" >> .env.local
echo "UPSTASH_REDIS_REST_TOKEN=AXXXXxxx" >> .env.local

# サーバー再起動
PORT=4000 npm run dev
```

### エラー: `fetch failed`

**原因**: Upstash RedisのURLまたはTokenが間違っている

**解決策**:

1. Upstash Console → Database → REST APIタブ
2. URLとTokenを再度コピー
3. `.env.local`を更新

### レート制限が効かない

**原因**: インメモリ実装のままになっている

**解決策**:

```bash
# rate-limit.tsの内容を確認
cat src/app/api/middleware/rate-limit.ts

# Upstash版になっていない場合は、AIに再実行を依頼
```

## 📊 モニタリング

### Upstash Console

- **Analytics**: リクエスト数・レイテンシの可視化
- **Keys**: 保存されているキーの確認（`ratelimit:api:*`など）
- **Logs**: エラーログの確認

### Sentry統合

レート制限超過は自動的にSentryに報告されます：

```typescript
// src/app/api/middleware/rate-limit.ts
if (!success) {
  captureMessage('Rate limit exceeded', {
    level: 'warning',
    tags: { clientId },
  });
}
```

## 🔗 参考リンク

- **Upstash公式ドキュメント**: https://upstash.com/docs/redis/features/ratelimiting
- **Upstash Console**: https://console.upstash.com/
- **Dayopt実装**: `src/lib/rate-limit/upstash.ts`

## ✅ チェックリスト

- [ ] Upstashアカウント作成
- [ ] Redisデータベース作成（Tokyo Region）
- [ ] 環境変数設定（`.env.local` + Vercel）
- [ ] `upstash.ts`のコメント解除
- [ ] `rate-limit.ts`をUpstash版に置き換え
- [ ] ローカル環境でテスト
- [ ] Upstash Consoleでリクエスト確認
- [ ] 本番環境にデプロイ

---

**📖 関連**: Weekly Security Report #567
**作成日**: 2025-10-20
**最終更新**: 2025-10-20

---

**種類**: 📗 ハウツーガイド
**最終更新**: 2025-12-11
**所有者**: Dayopt 開発チーム
