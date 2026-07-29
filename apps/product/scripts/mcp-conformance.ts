import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler,
} from '@modelcontextprotocol/node';
import type { AuthInfo } from '@modelcontextprotocol/server';

import { handleMcpProtocolRequest } from '../src/app/api/mcp/_protocol-handler';

const SPEC_VERSION = '2026-07-28';
const EXPECTED_FAILURES_PATH = fileURLToPath(
  new URL('./mcp-conformance-expected-failures.yml', import.meta.url),
);
const CONFORMANCE_CHILD_ENV_KEYS = [
  'CI',
  'COLORTERM',
  'FORCE_COLOR',
  'HOME',
  'NO_COLOR',
  'PATH',
  'PNPM_HOME',
  'TEMP',
  'TERM',
  'TMP',
  'TMPDIR',
  'SystemRoot',
  'WINDIR',
] as const;
const CONFORMANCE_AUTH_INFO: AuthInfo = {
  token: '<redacted>',
  clientId: 'chatgpt',
  scopes: ['read:entries', 'read:tags', 'read:constraints', 'read:stats'],
  resource: new URL('https://mcp.dayopt.app'),
  extra: {
    tokenId: 'conformance-token',
    connectionId: 'conformance-connection',
    userId: 'conformance-user',
    resourceUri: 'https://mcp.dayopt.app',
  },
};

async function main(): Promise<void> {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'dayopt-mcp-conformance-'));
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();
  const nodeHandler = toNodeHandler({
    fetch: (request, options) =>
      handleMcpProtocolRequest(request, {
        ...options,
        authInfo: CONFORMANCE_AUTH_INFO,
      }),
  });
  const server = createServer((request, response) => {
    if (!hasHttpRequestTarget(request)) {
      response.writeHead(400).end();
      return;
    }
    if (!validateHost(request, response) || !validateOrigin(request, response)) return;
    void nodeHandler(request, response).catch((error: unknown) => {
      process.stderr.write(`MCP conformance adapter failed: ${errorMessage(error)}\n`);
    });
  });

  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('MCP conformance server did not expose a TCP port');
    }
    const serverUrl = `http://127.0.0.1:${address.port}/mcp`;

    await runScenario('server-stateless', serverUrl, outputDirectory);
    await runScenario('tools-list', serverUrl, outputDirectory);
    await verifyJsonArtifacts(outputDirectory);
    process.stdout.write('Dayopt MCP conformance checks passed.\n');
  } finally {
    server.close();
    await once(server, 'close');
    await rm(outputDirectory, { recursive: true, force: true });
  }
}

async function runScenario(
  scenario: 'server-stateless' | 'tools-list',
  serverUrl: string,
  outputDirectory: string,
): Promise<void> {
  const scenarioOutputDirectory = join(outputDirectory, scenario);
  const child = spawn(
    'pnpm',
    [
      'exec',
      'conformance',
      'server',
      '--url',
      serverUrl,
      '--scenario',
      scenario,
      '--spec-version',
      SPEC_VERSION,
      '--expected-failures',
      EXPECTED_FAILURES_PATH,
      '--output-dir',
      scenarioOutputDirectory,
    ],
    {
      stdio: 'inherit',
      env: createConformanceChildEnvironment(),
    },
  );
  const [exitCode] = (await once(child, 'close')) as [number | null];
  if (exitCode !== 0) {
    throw new Error(`MCP conformance scenario failed: ${scenario}`);
  }
}

async function verifyJsonArtifacts(directory: string): Promise<void> {
  const files = await listFiles(directory);
  const jsonFiles = files.filter((file) => file.endsWith('.json'));
  if (jsonFiles.length === 0) {
    throw new Error('MCP conformance did not write JSON result artifacts');
  }
  for (const file of jsonFiles) {
    void JSON.parse(await readFile(file, 'utf8'));
  }
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : Promise.resolve([path]);
    }),
  );
  return nested.flat();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function createConformanceChildEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
  for (const key of CONFORMANCE_CHILD_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

function hasHttpRequestTarget(
  request: IncomingMessage,
): request is IncomingMessage & { method: string; url: string } {
  return (
    typeof request.method === 'string' &&
    request.method.length > 0 &&
    typeof request.url === 'string' &&
    request.url.length > 0
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(`Dayopt MCP conformance failed: ${errorMessage(error)}\n`);
  process.exitCode = 1;
});
