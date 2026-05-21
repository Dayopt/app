#!/usr/bin/env node

/**
 * tRPC API仕様書自動生成スクリプト
 *
 * 全tRPCルーターからOpenAPI 3.1互換のAPI仕様を抽出・生成する。
 * input型、認証要件、レート制限、エラーコードを構造化して出力。
 *
 * Usage:
 *   npx tsx scripts/generate-api-spec.ts              # apps/storybook/docs/api/openapi.json に生成
 *   npx tsx scripts/generate-api-spec.ts --check       # 既存specと比較（CI用ドリフト検出）
 *   npx tsx scripts/generate-api-spec.ts --output path  # 出力先を指定
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import Module from 'module';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { format as formatWithPrettier } from 'prettier';
import type { ZodType } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import type { ProcedureMeta } from '../apps/product/src/lib/trpc/procedures';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEFAULT_OUTPUT = resolve(ROOT, 'apps/storybook/docs/api/openapi.json');
const CHECK_MODE = process.argv.includes('--check');
const OUTPUT_INDEX = process.argv.indexOf('--output');
const OUTPUT_PATH = OUTPUT_INDEX !== -1 ? resolve(process.argv[OUTPUT_INDEX + 1]) : DEFAULT_OUTPUT;

type AppRouterLike = { _def: { record: Record<string, unknown> } };

function installServerOnlyShim(): void {
  const moduleWithLoad = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleWithLoad._load;

  moduleWithLoad._load = function patchedLoad(
    request: string,
    parent: unknown,
    isMain: boolean,
  ): unknown {
    if (request === 'server-only') {
      return {};
    }

    return originalLoad.call(this, request, parent, isMain);
  };
}

async function loadRuntimeModules(): Promise<{
  appRouter: AppRouterLike;
  errorCodeMap: Record<string, string>;
}> {
  installServerOnlyShim();

  const [{ ERROR_CODE_MAP }, { appRouter }] = await Promise.all([
    import('../apps/product/src/lib/trpc/errors'),
    import('../apps/product/src/lib/trpc/root'),
  ]);

  return {
    appRouter: appRouter as AppRouterLike,
    errorCodeMap: ERROR_CODE_MAP,
  };
}

// ---------------------------------------------------------------------------
// 1. tRPCルーターツリー走査
// ---------------------------------------------------------------------------

interface ProcedureInfo {
  /** ドット区切りのパス（例: "entries.list"） */
  path: string;
  /** query | mutation */
  type: 'query' | 'mutation';
  /** ProcedureMetaから取得 */
  meta: ProcedureMeta;
  /** Zodスキーマから変換したJSON Schema */
  inputSchema: Record<string, unknown> | null;
}

/**
 * tRPC v11のプロシージャ _def 型（内部API）
 */
interface ProcedureDef {
  procedure: true;
  type: 'query' | 'mutation' | 'subscription';
  inputs: ZodType[];
  meta: ProcedureMeta | undefined;
  resolver: unknown;
}

function isProcedure(value: unknown): value is { _def: ProcedureDef } {
  if (value === null || value === undefined) return false;
  // tRPC v11のプロシージャはfunction型（callable）
  if (typeof value !== 'object' && typeof value !== 'function') return false;
  const def = (value as Record<string, unknown>)._def;
  if (!def || typeof def !== 'object') return false;
  return (def as Record<string, unknown>).procedure === true;
}

function extractInputSchema(inputs: ZodType[]): Record<string, unknown> | null {
  if (inputs.length === 0) return null;

  // tRPCは複数の .input() チェーンを配列で保持。最後のものを使用
  const schema = inputs[inputs.length - 1];
  if (!schema) return null;

  try {
    const jsonSchema = zodToJsonSchema(schema, {
      target: 'openApi3',
      $refStrategy: 'none',
    });

    // zodToJsonSchema はトップレベルに $schema などを付与する場合があるので除去
    const { $schema: _s, ...rest } = jsonSchema as Record<string, unknown>;
    return rest;
  } catch {
    // 変換できないスキーマ（カスタムrefine等）はスキップ
    return null;
  }
}

function walkRouter(record: Record<string, unknown>, parentPath: string[] = []): ProcedureInfo[] {
  const results: ProcedureInfo[] = [];

  for (const [key, value] of Object.entries(record)) {
    const currentPath = [...parentPath, key];

    if (isProcedure(value)) {
      const def = value._def;
      if (def.type === 'subscription') continue; // subscriptionはスキップ

      results.push({
        path: currentPath.join('.'),
        type: def.type,
        meta: def.meta ?? {},
        inputSchema: extractInputSchema(def.inputs),
      });
    } else if (value !== null && typeof value === 'object') {
      // ネストされたルーターレコード
      results.push(...walkRouter(value as Record<string, unknown>, currentPath));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// 2. エラーレスポンス定義の生成
// ---------------------------------------------------------------------------

const TRPC_TO_HTTP_STATUS: Record<string, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
};

function buildErrorResponses(
  errorCodeMap: Record<string, string>,
): Record<string, Record<string, unknown>> {
  // ERROR_CODE_MAPからHTTPステータスごとにサービスエラーコードをグループ化
  const grouped = new Map<string, string[]>();

  for (const [serviceCode, trpcCode] of Object.entries(errorCodeMap)) {
    const existing = grouped.get(trpcCode) ?? [];
    existing.push(serviceCode);
    grouped.set(trpcCode, existing);
  }

  const responses: Record<string, Record<string, unknown>> = {};

  for (const [trpcCode, serviceCodes] of grouped) {
    const httpStatus = TRPC_TO_HTTP_STATUS[trpcCode];
    if (!httpStatus) continue;

    const name = trpcCode
      .split('_')
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join('');

    responses[name] = {
      description: `${trpcCode} (HTTP ${httpStatus})`,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  message: { type: 'string' },
                  code: { type: 'number', example: -32000 + httpStatus },
                  data: {
                    type: 'object',
                    properties: {
                      code: { type: 'string', enum: [trpcCode] },
                      httpStatus: { type: 'number', example: httpStatus },
                      serviceErrorCode: {
                        type: 'string',
                        enum: serviceCodes.sort(),
                        description: 'アプリケーション固有のエラーコード',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
  }

  return responses;
}

// ---------------------------------------------------------------------------
// 3. OpenAPIドキュメント生成
// ---------------------------------------------------------------------------

function buildSecurityForAuth(auth: ProcedureMeta['auth']): Record<string, unknown>[] | undefined {
  switch (auth) {
    case 'public':
      return undefined; // セキュリティ不要
    case 'protected':
    case 'pro':
    case 'admin':
      return [{ sessionCookie: [] }, { oauthBearer: [] }];
    default:
      // metaなし → protectedとして扱う（全プロシージャはprotectedProcedureベース）
      return [{ sessionCookie: [] }, { oauthBearer: [] }];
  }
}

function buildRateLimitExtension(meta: ProcedureMeta): Record<string, unknown> | undefined {
  if (meta.rateLimit) {
    return {
      'x-rate-limit': `${meta.rateLimit.requests} req/${meta.rateLimit.window}`,
    };
  }

  // protectedなら全体レート制限が適用される
  if (meta.auth !== 'public') {
    return { 'x-rate-limit': '100 req/min' };
  }

  return undefined;
}

function generateOpenApiSpec(
  procedures: ProcedureInfo[],
  errorCodeMap: Record<string, string>,
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  const inputSchemas: Record<string, Record<string, unknown>> = {};

  for (const proc of procedures) {
    const httpMethod = proc.type === 'query' ? 'get' : 'post';
    const tag = proc.path.split('.')[0];
    const schemaRefName = proc.path.replace(/\./g, '_') + '_input';

    // inputスキーマがあればcomponents/schemasに登録
    if (proc.inputSchema) {
      inputSchemas[schemaRefName] = proc.inputSchema;
    }

    const operation: Record<string, unknown> = {
      operationId: proc.path,
      tags: [tag],
      ...(proc.meta.description ? { summary: proc.meta.description } : {}),
      ...(proc.meta.deprecated ? { deprecated: true } : {}),
    };

    // セキュリティ
    const security = buildSecurityForAuth(proc.meta.auth);
    if (security) {
      operation.security = security;
    }

    // 入力パラメータ
    if (proc.inputSchema) {
      if (httpMethod === 'get') {
        operation.parameters = [
          {
            name: 'input',
            in: 'query',
            required: true,
            description: 'JSON-encoded input（SuperJSON形式）',
            content: {
              'application/json': {
                schema: { $ref: `#/components/schemas/${schemaRefName}` },
              },
            },
          },
        ];
      } else {
        operation.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: `#/components/schemas/${schemaRefName}` },
            },
          },
        };
      }
    }

    // レスポンス
    const responses: Record<string, unknown> = {
      200: { description: 'Success（SuperJSON形式）' },
    };

    if (proc.meta.auth !== 'public') {
      responses[401] = { $ref: '#/components/responses/Unauthorized' };
      responses[429] = { description: 'Too Many Requests（100 req/min）' };
    }
    if (proc.meta.auth === 'pro') {
      responses[403] = { $ref: '#/components/responses/Forbidden' };
    }
    if (proc.meta.auth === 'admin') {
      responses[403] = { $ref: '#/components/responses/Forbidden' };
    }

    operation.responses = responses;

    // レート制限拡張
    const rateLimitExt = buildRateLimitExtension(proc.meta);
    if (rateLimitExt) {
      Object.assign(operation, rateLimitExt);
    }

    // 認証レベル拡張
    if (proc.meta.auth) {
      operation['x-auth-level'] = proc.meta.auth;
    }

    paths[`/${proc.path}`] = {
      [httpMethod]: operation,
    };
  }

  const errorResponses = buildErrorResponses(errorCodeMap);

  return {
    openapi: '3.1.0',
    info: {
      title: 'Dayopt API',
      version: '1.0.0',
      description: [
        'Dayopt tRPC APIの自動生成仕様書。',
        '',
        '## ワイヤーフォーマット',
        'リクエスト/レスポンスはSuperJSONでエンコードされます。',
        'Date, BigInt等の非JSONプリミティブはSuperJSONメタデータで表現されます。',
        '',
        '## 認証',
        '3つの認証モードをサポート:',
        '1. **Session Cookie** — ブラウザ用（Supabase Auth）',
        '2. **OAuth 2.1 Bearer** — MCP/外部連携用',
        '3. **Service Role API Key** — 管理者用（x-api-key ヘッダー）',
        '',
        '## レート制限',
        '認証済みユーザー: 100 req/min（グローバル）。一部エンドポイントに固有制限あり。',
      ].join('\n'),
    },
    servers: [
      { url: 'https://app.dayopt.com/api/trpc', description: 'Production' },
      { url: 'https://staging.dayopt.com/api/trpc', description: 'Staging' },
    ],
    paths,
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'sb-access-token',
          description: 'Supabase Auth セッションCookie',
        },
        oauthBearer: {
          type: 'http',
          scheme: 'bearer',
          description: 'OAuth 2.1 アクセストークン（MCP/外部連携用）',
        },
        serviceRoleKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'Service Role Key（管理者用、RLSバイパス）',
        },
      },
      schemas: inputSchemas,
      responses: errorResponses,
    },
  };
}

// ---------------------------------------------------------------------------
// 4. メイン実行
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { appRouter, errorCodeMap } = await loadRuntimeModules();

  // ルーターツリー走査
  const record = appRouter._def.record;
  const procedures = walkRouter(record);

  // OpenAPIドキュメント生成
  const spec = generateOpenApiSpec(procedures, errorCodeMap);
  const specJson = await formatWithPrettier(JSON.stringify(spec), {
    parser: 'json',
    printWidth: 100,
  });

  // --check モード: 既存specと比較
  if (CHECK_MODE) {
    if (!existsSync(OUTPUT_PATH)) {
      console.error(`❌ API仕様書が見つかりません: ${OUTPUT_PATH}`);
      console.error('   pnpm --filter @dayopt/product api:spec を実行して生成してください。');
      process.exit(1);
    }

    const existing = readFileSync(OUTPUT_PATH, 'utf-8');
    if (existing === specJson) {
      console.log(`✅ API仕様書は最新です（${procedures.length} プロシージャ）`);
      process.exit(0);
    } else {
      console.error('❌ API仕様書が最新ではありません。');
      console.error('   pnpm --filter @dayopt/product api:spec を実行して更新してください。');
      process.exit(1);
    }
  }

  // 通常モード: ファイル出力
  const outputDir = dirname(OUTPUT_PATH);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  writeFileSync(OUTPUT_PATH, specJson, 'utf-8');

  // サマリー出力
  const routerCounts = new Map<string, number>();
  for (const proc of procedures) {
    const router = proc.path.split('.')[0];
    routerCounts.set(router, (routerCounts.get(router) ?? 0) + 1);
  }

  console.log(`✅ API仕様書を生成しました: ${OUTPUT_PATH}`);
  console.log(`   プロシージャ数: ${procedures.length}`);
  console.log(`   ルーター内訳:`);
  for (const [router, count] of [...routerCounts.entries()].sort()) {
    console.log(`     ${router}: ${count}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
