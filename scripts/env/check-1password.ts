import { spawnSync } from 'node:child_process';

import { forbiddenFields, onePasswordEnvSchema, operationalItems } from './schema';

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
  if (status !== 'OK' && entry.pendingReason) {
    console.log(`  └ pending: ${entry.pendingReason}`);
  }
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

// 禁止 field は「存在しないこと」が期待値。schema から entry を消しただけでは
// 実 vault に残った field を誰も検査しないため、ここで実在を落とす。
//
// 保証境界: ABSENT は「正常応答から不在を確認できた」時だけ出す。op の応答は
// vault / item / field の 3 段しかなく、そのすべてで確認不能を UNVERIFIABLE として
// 失敗に倒すため、「確認できないまま pass する」経路はこのループには残らない。
function reportForbidden(label: string, detail: string): void {
  console.log(label);
  console.log(`  └ ${detail}`);
  hasFailure = true;
}

for (const forbidden of forbiddenFields) {
  const label = `${forbidden.vault} / ${forbidden.item} / ${forbidden.field}`;

  // vault を取得できない理由（不在 / 権限不足 / 一時エラー）は区別できない
  if (!hasVault(forbidden.vault)) {
    reportForbidden(`${label}: UNVERIFIABLE`, 'vault を取得できないため不在を確認できません');
    continue;
  }

  const itemResult = getItem(forbidden.vault, forbidden.item);
  if (itemResult.status === 'OP_TIMEOUT') {
    console.log(`1Password: OP_TIMEOUT`);
    process.exit(1);
  }
  // getItem は item 不在・権限エラー・一時エラー・不正 JSON をすべて MISSING_ITEM へ
  // 畳むため、取得失敗を不在の証拠として使えない
  if (itemResult.status !== 'OK') {
    reportForbidden(`${label}: UNVERIFIABLE`, 'item を取得できないため不在を確認できません');
    continue;
  }

  // ここだけが不在の positive evidence。値が空でも field 自体は存在する
  if (getField(itemResult.item, forbidden.field)) {
    reportForbidden(`${label}: FORBIDDEN_PRESENT`, `削除してください: ${forbidden.reason}`);
    continue;
  }

  console.log(`${label}: ABSENT`);
}

if (hasFailure) {
  process.exitCode = 1;
}
