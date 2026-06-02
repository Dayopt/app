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

const literalPatterns: Array<{ name: string; regex: RegExp; alwaysFlag?: boolean }> = [
  { name: 'stripe_secret_key', regex: /\bsk_(?:live|test)_[A-Za-z0-9_=-]{3,}\b/, alwaysFlag: true },
  { name: 'stripe_webhook_secret', regex: /\bwhsec_[A-Za-z0-9_=-]{3,}\b/, alwaysFlag: true },
  {
    name: 'github_token',
    regex: /\b(?:ghp|gho)_[A-Za-z0-9_]{12,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
    alwaysFlag: true,
  },
  { name: 'slack_token', regex: /\bxox[bp]-[A-Za-z0-9-]{10,}\b/, alwaysFlag: true },
  { name: 'resend_api_key', regex: /\bre_[A-Za-z0-9]{20,}\b/, alwaysFlag: true },
  {
    name: 'jwt_like_token',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    name: 'postgres_url_with_password',
    regex: /\bpostgres(?:ql)?:\/\/[^:\s/@]+:[^@\s]+@[^)\s]+/,
    alwaysFlag: true,
  },
  { name: 'private_key_block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, alwaysFlag: true },
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
    'test-token',
    'test-secret',
    'your-test-password',
    'xxx',
    'required',
    'optional',
  ]);

  return exactPlaceholders.has(lower) || lower.startsWith('your_') || lower.startsWith('your-');
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
    if (!pattern.alwaysFlag && isAllowedValue(line)) continue;
    const match = line.match(pattern.regex);
    if (match) {
      if (pattern.name === 'jwt_like_token' && isAllowedJwtFixture(file, line, match[0])) continue;
      findings.push({
        file,
        line: lineNumber,
        key: assignment?.groups?.key ?? '(literal)',
        pattern: pattern.name,
      });
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
