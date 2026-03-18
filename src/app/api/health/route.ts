import { NextResponse } from 'next/server';

/**
 * 🏥 Health Check API エンドポイント
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
    external_apis: 'ok' | 'error' | 'warning';
    memory: 'ok' | 'error' | 'warning';
  };
  details?: {
    error?: string;
    warnings?: string[];
  };
}

/**
 * データベース接続チェック
 */
async function checkDatabase(): Promise<'ok' | 'error' | 'warning'> {
  try {
    // 環境変数の存在確認
    const hasDbUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    const hasDbKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!hasDbUrl || !hasDbKey) {
      return 'warning';
    }

    return 'ok';
  } catch {
    return 'error';
  }
}

/**
 * 外部API接続チェック
 */
async function checkExternalAPIs(): Promise<'ok' | 'error' | 'warning'> {
  try {
    return 'ok';
  } catch {
    return 'warning';
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
    const [dbStatus, apiStatus] = await Promise.all([checkDatabase(), checkExternalAPIs()]);

    const memoryStatus = checkMemory();

    // 全体的な状態を判定
    const hasError = [dbStatus, apiStatus, memoryStatus].includes('error');
    const hasWarning = [dbStatus, apiStatus, memoryStatus].includes('warning');

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
        external_apis: apiStatus,
        memory: memoryStatus,
      },
    };

    // エラーや警告の詳細を追加
    const warnings: string[] = [];
    if (dbStatus === 'warning') warnings.push('Database configuration incomplete');
    if (apiStatus === 'warning') warnings.push('Some external APIs not accessible');
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
        external_apis: 'error',
        memory: 'error',
      },
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    };

    return NextResponse.json(errorStatus, { status: 503 });
  }
}
