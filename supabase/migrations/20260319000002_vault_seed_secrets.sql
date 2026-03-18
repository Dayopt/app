-- ============================================================
-- Vault シークレット初期登録（プレースホルダー）
-- ============================================================
-- 注意: 実際のシークレット値はここに書かない。
-- プレースホルダーを挿入し、デプロイ後に Dashboard SQL Editor で更新する。
--
-- 適用手順:
--   1. supabase db push でマイグレーション適用（プレースホルダーが登録される）
--   2. Dashboard > SQL Editor で実際の値に UPDATE:
--      UPDATE vault.secrets SET secret = '<actual_value>' WHERE name = 'service_role_key';
--      （全シークレットについて同様）
-- ============================================================

DO $$
BEGIN
  -- ========================================
  -- 即時利用: pg_cron/pg_net から使用
  -- ========================================

  -- service_role_key: pg_net HTTP 呼び出しの認証ヘッダー
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'service_role_key') THEN
    PERFORM vault.create_secret(
      'PLACEHOLDER_REPLACE_ME',
      'service_role_key',
      'Supabase service role key for pg_net HTTP calls'
    );
  END IF;

  -- supabase_url: pg_net HTTP 呼び出しのベース URL
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'supabase_url') THEN
    PERFORM vault.create_secret(
      'PLACEHOLDER_REPLACE_ME',
      'supabase_url',
      'Supabase project URL for pg_net HTTP calls'
    );
  END IF;

  -- cron_secret: Edge Function の cron 認証用 Bearer token
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'cron_secret') THEN
    PERFORM vault.create_secret(
      'PLACEHOLDER_REPLACE_ME',
      'cron_secret',
      'Bearer token for Edge Function cron authentication'
    );
  END IF;

  -- ========================================
  -- 基盤登録: 将来の DB 関数利用に備えて暗号化保存
  -- ========================================

  -- recovery_code_pepper: MFA リカバリーコードの HMAC ペッパー
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'recovery_code_pepper') THEN
    PERFORM vault.create_secret(
      'PLACEHOLDER_REPLACE_ME',
      'recovery_code_pepper',
      'HMAC pepper for MFA recovery code hashing'
    );
  END IF;

  -- stripe_secret_key: Stripe API シークレットキー
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'stripe_secret_key') THEN
    PERFORM vault.create_secret(
      'PLACEHOLDER_REPLACE_ME',
      'stripe_secret_key',
      'Stripe API secret key'
    );
  END IF;

  -- stripe_webhook_secret: Stripe Webhook 署名検証キー
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'stripe_webhook_secret') THEN
    PERFORM vault.create_secret(
      'PLACEHOLDER_REPLACE_ME',
      'stripe_webhook_secret',
      'Stripe webhook signature verification secret'
    );
  END IF;

  -- resend_api_key: Resend メール送信 API キー
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'resend_api_key') THEN
    PERFORM vault.create_secret(
      'PLACEHOLDER_REPLACE_ME',
      'resend_api_key',
      'Resend email service API key'
    );
  END IF;

  -- resend_webhook_secret: Resend Webhook 署名検証キー
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'resend_webhook_secret') THEN
    PERFORM vault.create_secret(
      'PLACEHOLDER_REPLACE_ME',
      'resend_webhook_secret',
      'Resend webhook signature verification secret (Svix)'
    );
  END IF;

  -- anthropic_api_key: Anthropic Claude API キー（Free tier 用）
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'anthropic_api_key') THEN
    PERFORM vault.create_secret(
      'PLACEHOLDER_REPLACE_ME',
      'anthropic_api_key',
      'Anthropic Claude API key for free tier chat'
    );
  END IF;

END;
$$;
