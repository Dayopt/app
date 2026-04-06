import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { isUpstashEnabled } from '@/lib/rate-limit/upstash';

/**
 * Health Check API エンドポイント
 *
 * アプリケーションの稼働状況を確認するためのヘルスチェック
 * デプロイ後の動作確認やモニタリングに使用
 */

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks: {
    database: 'ok' | 'error' | 'warning';
    redis: 'ok' | 'error' | 'warning' | 'skipped';
    memory: 'ok' | 'error' | 'warning';
  };
  details?: {
    error?: string;
    warnings?: string[];
  };
}

/** DB疎通タイムアウト（ms） */
const DB_CHECK_TIMEOUT_MS = 5_000;

/**
 * データベース接続チェック — 実際に SELECT 1 で疎通確認
 */
async function checkDatabase(): Promise<'ok' | 'error' | 'warning'> {
  const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const dbKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!dbUrl || !dbKey) {
    return 'warning';
  }

  try {
    const supabase = createClient(dbUrl, dbKey, {
      auth: { persistSession: false },
      global: {
        fetch: (url, options) =>
          fetch(url, { ...options, signal: AbortSignal.timeout(DB_CHECK_TIMEOUT_MS) }),
      },
    });

    const { error } = await supabase.rpc('ping' as never);

    // ping RPC が無くても、接続自体は成功する（PGRST202 = function not found = DB is alive）
    if (error && !error.message.includes('ping') && !error.code?.startsWith('PGRST')) {
      return 'error';
    }

    return 'ok';
  } catch {
    return 'error';
  }
}

/**
 * Redis（Upstash）接続チェック
 */
async function checkRedis(): Promise<'ok' | 'error' | 'warning' | 'skipped'> {
  if (!isUpstashEnabled) {
    return 'skipped';
  }

  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    const pong = await redis.ping();
    return pong === 'PONG' ? 'ok' : 'warning';
  } catch {
    return 'error';
  }
}

/**
 * メモリ使用量チェック
 */
function checkMemory(): 'ok' | 'error' | 'warning' {
  try {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;

    // メモリ使用率が80%以上で警告、95%以上でエラー
    const usageRatio = heapUsedMB / heapTotalMB;

    if (usageRatio > 0.95) {
      return 'error';
    } else if (usageRatio > 0.8) {
      return 'warning';
    }

    return 'ok';
  } catch {
    return 'error';
  }
}

/**
 * アプリケーションの稼働時間を取得
 */
function getUptime(): number {
  return process.uptime();
}

/**
 * アプリケーションバージョンを取得
 */
function getVersion(): string {
  try {
    // package.json から版数取得
    return process.env.npm_package_version || '0.0.0';
  } catch {
    return 'unknown';
  }
}

/**
 * 環境名を取得
 */
function getEnvironment(): string {
  if (process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV;
  }

  return process.env.NODE_ENV || 'development';
}

/**
 * 本番環境かどうかを判定
 */
function isProduction(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

/**
 * GET /api/health
 * ヘルスチェック実行
 *
 * 本番環境ではステータスのみ返す（情報露出防止）
 */
export async function GET() {
  try {
    const startTime = Date.now();

    // 各種チェックを並行実行
    const [dbStatus, redisStatus] = await Promise.all([checkDatabase(), checkRedis()]);

    const memoryStatus = checkMemory();

    // 全体的な状態を判定（skipped は無視）
    const checkResults = [dbStatus, redisStatus, memoryStatus].filter((s) => s !== 'skipped');
    const hasError = checkResults.includes('error');
    const hasWarning = checkResults.includes('warning');

    const overallStatus: HealthStatus['status'] = hasError
      ? 'unhealthy'
      : hasWarning
        ? 'degraded'
        : 'healthy';

    const httpStatus = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

    // 本番環境ではステータスのみ返す（内部情報の露出を防止）
    if (isProduction()) {
      return NextResponse.json(
        { status: overallStatus },
        {
          status: httpStatus,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        },
      );
    }

    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: getUptime(),
      version: getVersion(),
      environment: getEnvironment(),
      checks: {
        database: dbStatus,
        redis: redisStatus,
        memory: memoryStatus,
      },
    };

    // エラーや警告の詳細を追加
    const warnings: string[] = [];
    if (dbStatus === 'warning') warnings.push('Database configuration incomplete');
    if (dbStatus === 'error') warnings.push('Database connection failed');
    if (redisStatus === 'error') warnings.push('Redis connection failed');
    if (redisStatus === 'skipped') warnings.push('Redis not configured (rate limiting degraded)');
    if (memoryStatus === 'warning') warnings.push('High memory usage detected');

    if (warnings.length > 0) {
      healthStatus.details = { warnings };
    }

    const responseTime = Date.now() - startTime;

    // レスポンス時間をヘッダーに追加
    const response = NextResponse.json(healthStatus, { status: httpStatus });

    response.headers.set('X-Response-Time', `${responseTime}ms`);
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.headers.set('X-Health-Check-Version', '1.0');

    return response;
  } catch (error) {
    // 本番環境ではエラー詳細を隠す
    if (isProduction()) {
      return NextResponse.json({ status: 'unhealthy' }, { status: 503 });
    }

    // ヘルスチェック自体でエラーが発生した場合
    const errorStatus: HealthStatus = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: getUptime(),
      version: getVersion(),
      environment: getEnvironment(),
      checks: {
        database: 'error',
        redis: 'error',
        memory: 'error',
      },
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    };

    return NextResponse.json(errorStatus, { status: 503 });
  }
}
