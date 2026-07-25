import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

type Finding = {
  file: string;
  line: number;
  key: string;
  pattern: string;
};

const maxFileBytes = 1024 * 1024;
const ignoredPathParts = new Set(['node_modules', '.next', 'storybook-static', '.turbo', '.git']);

/**
 * Supabase local の既定接続文字列だけを除外する。
 *
 * `postgres:postgres@127.0.0.1` は Supabase CLI が全環境へ同じ値で配る固定 default で、
 * 秘密ではない。手順書がこの文字列を書けないと `psql` の実行例を載せられなくなる。
 *
 * 判定は「マッチ全体がこの形と完全一致するか」で行う。host と password だけを見て
 * 通すと、同じマッチに含まれる query / fragment / path に本物の値を載せられる
 * （`...@127.0.0.1:54322/postgres?password=REAL` が host も password も既定値のまま通る）。
 * URL parse ではなく厳格な正規表現にしているのは、percent-encoding や userinfo 内の
 * 追加 `@` といった解釈の揺れを判断材料にしないため。
 */
const localPostgresUrl =
  /^postgres(?:ql)?:\/\/postgres:postgres@(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/[A-Za-z0-9_-]*)?$/;

function isLocalPostgresUrl(match: string): boolean {
  // 正規表現側は `[^)\s]+` なので、引用符で囲まれた実行例では末尾の記号まで拾う。
  return localPostgresUrl.test(match.replace(/['"`,;]+$/, ''));
}

/** `matchAll` は g フラグ必須。元の定義を壊さないよう複製して付ける。 */
function globalRegex(regex: RegExp): RegExp {
  return regex.flags.includes('g') ? regex : new RegExp(regex.source, `${regex.flags}g`);
}

/**
 * `alwaysFlag` は廃止した。
 *
 * 「placeholder らしい行では literal 検査を丸ごと省く」という前置フィルタのための旗だったが、
 * 省略対象は jwt_like_token 1 件だけで、しかも判定に *行全体* を渡していた。そのため
 * `test-token: eyJ…` のように行頭が placeholder らしいだけで、本物の JWT が丸ごと
 * 見逃されていた。placeholder 値がそもそも JWT の正規表現に一致しない以上この前置フィルタに
 * 実益はなく、正規の fixture は isAllowedJwtFixture が個別に扱う。
 */
const literalPatterns: Array<{
  name: string;
  regex: RegExp;
  isAllowedMatch?: (match: string) => boolean;
}> = [
  { name: 'stripe_secret_key', regex: /\bsk_(?:live|test)_[A-Za-z0-9_=-]{3,}\b/ },
  { name: 'stripe_webhook_secret', regex: /\bwhsec_[A-Za-z0-9_=-]{3,}\b/ },
  {
    name: 'github_token',
    regex: /\b(?:ghp|gho)_[A-Za-z0-9_]{12,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  },
  { name: 'slack_token', regex: /\bxox[bp]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'resend_api_key', regex: /\bre_[A-Za-z0-9]{20,}\b/ },
  {
    name: 'jwt_like_token',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    name: 'postgres_url_with_password',
    regex: /\bpostgres(?:ql)?:\/\/[^:\s/@]+:[^@\s]+@[^)\s]+/,
    isAllowedMatch: isLocalPostgresUrl,
  },
  { name: 'private_key_block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

const sensitiveKey =
  '[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|SERVICE_ROLE_KEY|WEBHOOK_SECRET|PEPPER|API_KEY|DATABASE_URL|POSTGRES_URL|SENTRY_AUTH_TOKEN|STRIPE_SECRET_KEY)[A-Z0-9_]*';
const envAssignment = new RegExp(
  `^\\s*(?:export\\s+)?(?<key>${sensitiveKey})\\s*=\\s*(?<value>.+?)\\s*$`,
);
const yamlAssignment = new RegExp(`^\\s*(?<key>${sensitiveKey})\\s*:\\s*(?<value>.+?)\\s*$`);

function hasIgnoredPathPart(file: string): boolean {
  return file.split('/').some((part) => ignoredPathParts.has(part));
}

function isTextFile(file: string): boolean {
  try {
    const content = readFileSync(file);
    return !content.includes(0);
  } catch {
    return false;
  }
}

/**
 * fixture として通す値の形。**小文字化前の生の値**に対して判定すること。
 * `lower` に当てると `test-AbC123XyZ` が `test-abc123xyz` になって通ってしまい、
 * 「小文字だけ」という制限そのものが無意味になる。
 */
const fixtureValue = /^test-[a-z0-9-]*$/;

function isAllowedValue(rawValue: string): boolean {
  const value = rawValue
    .replace(/\s+#.*$/, '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
  const lower = value.toLowerCase();

  if (!value) return true;
  if (value.startsWith('op://')) return true;
  if (value.startsWith('${{') || value.startsWith('$')) return true;
  if (/^env\([A-Z0-9_]+\)$/.test(value)) return true;
  if (value.startsWith('<') && value.endsWith('>')) return true;

  const exactPlaceholders = new Set([
    'placeholder',
    'dummy',
    'mock',
    'changeme',
    'example',
    'your-test-password',
    'xxx',
    'required',
    'optional',
  ]);

  // `test-` は元々 `test-token` / `test-secret` を 1 件ずつ列挙していたものの一般化。
  // fixture を足すたびに Set へ追記が要る形は腐るので接頭辞で受けるが、接頭辞「だけ」を
  // 見ると `test-` から始まる本物の値まで通る。値全体が fixture の形（小文字・数字・
  // ハイフンのみ）であることまで要求する。実 credential は大文字・記号・base64 断片や
  // JWT の `.` を含むため、この形には収まらない。
  return (
    exactPlaceholders.has(lower) ||
    fixtureValue.test(value) ||
    lower.startsWith('your_') ||
    lower.startsWith('your-')
  );
}

function isYamlFile(file: string): boolean {
  return /\.ya?ml$/i.test(file);
}

function getSensitiveAssignment(file: string, line: string): RegExpMatchArray | null {
  return line.match(isYamlFile(file) ? yamlAssignment : envAssignment);
}

function decodeJwtPayload(token: string): string | null {
  const [, payload] = token.split('.');
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function isAllowedJwtFixture(file: string, line: string, token: string): boolean {
  const lowerFile = file.toLowerCase();
  const lowerLine = line.toLowerCase();

  if (
    lowerFile.endsWith('apps/product/src/lib/sentry/scrub-pii.test.ts') &&
    lowerLine.includes('const jwt =')
  ) {
    return true;
  }

  return decodeJwtPayload(token)?.toLowerCase().includes('supabase-demo') ?? false;
}

function getTrackedFiles(): string[] {
  const output = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  return output.split('\0').filter(Boolean);
}

function getEnvFiles(): string[] {
  const files = new Set<string>();

  for (const name of readdirSync('.')) {
    if (name.startsWith('.env') || name.startsWith('.op-env')) files.add(name);
  }

  if (existsSync('apps')) {
    for (const appName of readdirSync('apps')) {
      const appDir = join('apps', appName);
      if (!statSync(appDir).isDirectory()) continue;
      for (const name of readdirSync(appDir)) {
        if (name.startsWith('.env')) files.add(join(appDir, name));
      }
    }
  }

  if (existsSync('supabase')) {
    for (const name of readdirSync('supabase')) {
      if (name.startsWith('.env')) files.add(join('supabase', name));
    }
  }

  return [...files];
}

function getScanFiles(): string[] {
  return [...new Set([...getTrackedFiles(), ...getEnvFiles()])].filter((file) => {
    if (!existsSync(file)) return false;
    if (hasIgnoredPathPart(file)) return false;
    const stat = statSync(file);
    if (!stat.isFile() || stat.size > maxFileBytes) return false;
    return isTextFile(file);
  });
}

function scanLine(file: string, line: string, lineNumber: number): Finding[] {
  const findings: Finding[] = [];
  const assignment = getSensitiveAssignment(file, line);
  if (assignment?.groups) {
    const key = assignment.groups.key;
    const value = assignment.groups.value;
    if (!isAllowedValue(value)) {
      findings.push({ file, line: lineNumber, key, pattern: 'sensitive_env_assignment' });
    }
  }

  for (const pattern of literalPatterns) {
    // 1 行に複数マッチがありうる。先頭マッチだけを見て除外すると、除外対象の直後に
    // 並べた本物の値が丸ごと素通りする（local URL と production URL を同じ行に書く形）。
    // マッチごとに判定し、除外されないものが 1 つでもあれば報告する。
    for (const match of line.matchAll(globalRegex(pattern.regex))) {
      const matched = match[0];
      if (pattern.name === 'jwt_like_token' && isAllowedJwtFixture(file, line, matched)) continue;
      if (pattern.isAllowedMatch?.(matched)) continue;

      findings.push({
        file,
        line: lineNumber,
        key: assignment?.groups?.key ?? '(literal)',
        pattern: pattern.name,
      });
      // 報告は 1 行 1 pattern につき 1 件に留める（同じ行の重複報告を増やさない）。
      break;
    }
  }

  return findings;
}

const findings: Finding[] = [];

for (const file of getScanFiles()) {
  if (!existsSync(file)) continue;
  const content = readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    findings.push(...scanLine(file, line, index + 1));
  });
}

if (findings.length > 0) {
  console.log('NG: possible secret literal found');
  for (const finding of findings) {
    console.log(`file: ${finding.file}`);
    console.log(`key: ${finding.key}`);
    console.log(`line: ${finding.line}`);
    console.log(`pattern: ${finding.pattern}`);
    console.log('value: [redacted]');
  }
  process.exitCode = 1;
} else {
  console.log('OK: no secret literals found');
}
