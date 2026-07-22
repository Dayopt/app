import { spawnSync } from 'node:child_process';

import { onePasswordEnvSchema, operationalItems } from './schema';

type CommandResult = {
  ok: boolean;
  stdout: string;
  timedOut: boolean;
};

type OnePasswordField = {
  id?: string;
  label?: string;
  value?: unknown;
};

type OnePasswordItem = {
  fields?: OnePasswordField[];
};

type ItemResult =
  { status: 'OK'; item: OnePasswordItem } | { status: 'MISSING_ITEM' } | { status: 'OP_TIMEOUT' };

const vaultCache = new Map<string, boolean>();
const itemCache = new Map<string, ItemResult>();
const opTimeoutMs = 20_000;

function runOp(args: string[]): CommandResult {
  const result = spawnSync('op', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: opTimeoutMs,
    killSignal: 'SIGKILL',
  });

  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    timedOut: result.error?.name === 'TimeoutError',
  };
}

function ensureOpReady(): boolean {
  const version = spawnSync('op', ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: opTimeoutMs,
    killSignal: 'SIGKILL',
  });
  if (version.error?.name === 'TimeoutError') {
    console.log('1Password: OP_TIMEOUT');
    return false;
  }
  if (version.status !== 0) {
    console.log('1Password: OP_CLI_MISSING');
    return false;
  }

  const account = runOp(['account', 'list', '--format=json']);
  if (account.timedOut) {
    console.log('1Password: OP_TIMEOUT');
    return false;
  }
  if (!account.ok) {
    console.log('1Password: AUTH_ERROR');
    return false;
  }

  return true;
}

function hasVault(vault: string): boolean {
  if (!vaultCache.has(vault)) {
    const result = runOp(['vault', 'get', vault]);
    if (result.timedOut) {
      console.log(`1Password: OP_TIMEOUT`);
      process.exit(1);
    }
    vaultCache.set(vault, result.ok);
  }
  return vaultCache.get(vault) ?? false;
}

function getItem(vault: string, item: string): ItemResult {
  const key = `${vault}/${item}`;
  if (!itemCache.has(key)) {
    const result = runOp(['item', 'get', item, '--vault', vault, '--format=json']);
    if (result.timedOut) {
      itemCache.set(key, { status: 'OP_TIMEOUT' });
    } else if (!result.ok) {
      itemCache.set(key, { status: 'MISSING_ITEM' });
    } else {
      try {
        itemCache.set(key, { status: 'OK', item: JSON.parse(result.stdout) as OnePasswordItem });
      } catch {
        itemCache.set(key, { status: 'MISSING_ITEM' });
      }
    }
  }

  return itemCache.get(key) ?? { status: 'MISSING_ITEM' };
}

function getField(item: OnePasswordItem, fieldName: string): OnePasswordField | undefined {
  return item.fields?.find((field) => field.id === fieldName || field.label === fieldName);
}

function checkField(
  vault: string,
  itemName: string,
  field: string,
): 'OK' | 'MISSING_ITEM' | 'MISSING_FIELD' | 'EMPTY' {
  const itemResult = getItem(vault, itemName);
  if (itemResult.status === 'OP_TIMEOUT') {
    console.log(`1Password: OP_TIMEOUT`);
    process.exit(1);
  }
  if (itemResult.status !== 'OK') return 'MISSING_ITEM';

  const foundField = getField(itemResult.item, field);
  if (!foundField) return 'MISSING_FIELD';
  if (typeof foundField.value === 'string' && foundField.value.trim() === '') return 'EMPTY';
  if (foundField.value === null || foundField.value === undefined) return 'EMPTY';
  return 'OK';
}

let hasFailure = false;

if (!ensureOpReady()) {
  process.exit(1);
}

for (const entry of onePasswordEnvSchema) {
  let status: 'OK' | 'MISSING_VAULT' | 'MISSING_ITEM' | 'MISSING_FIELD' | 'EMPTY';
  if (!hasVault(entry.vault)) {
    status = 'MISSING_VAULT';
  } else {
    status = checkField(entry.vault, entry.item, entry.field);
  }

  console.log(`${entry.vault} / ${entry.item} / ${entry.field}: ${status}`);
  if (entry.required && status !== 'OK') hasFailure = true;
}

for (const item of operationalItems) {
  let status: 'OK' | 'MISSING_VAULT' | 'MISSING_ITEM';
  if (!hasVault(item.vault)) {
    status = 'MISSING_VAULT';
  } else {
    const itemResult = getItem(item.vault, item.item);
    if (itemResult.status === 'OP_TIMEOUT') {
      console.log(`1Password: OP_TIMEOUT`);
      process.exit(1);
    }
    status = itemResult.status === 'OK' ? 'OK' : 'MISSING_ITEM';
  }

  console.log(`${item.vault} / ${item.item}: ${status}`);
  if (item.required && status !== 'OK') hasFailure = true;
}

if (hasFailure) {
  process.exitCode = 1;
}
