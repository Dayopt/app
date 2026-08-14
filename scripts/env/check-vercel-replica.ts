import { onePasswordEnvSchema } from './schema';

/**
 * replica ⊆ 台帳 検査（#2084）。
 *
 * Vercel production env の key 名だけを取得し、1Password 台帳
 * （scripts/env/schema.ts の onePasswordEnvSchema）に無い key を検出する。
 * 既存の production-config-audit.mjs が「台帳側の必須 key が Vercel に揃って
 * いるか」（台帳 → replica）を見るのに対し、こちらは逆方向 —「Vercel にあるが
 * 台帳に無い値の存在」= docs/operations/secrets.md 基本方針 7
 * 「値がどこに存在していようと、必ず 1Password にもある」の違反を検出する。
 *
 * 値は一切取得・保持・表示しない。API 応答は key / target のみに即時射影し、
 * value プロパティには触れない（secrets.md §API 経由の設定読戻し）。
 *
 * fetch / 射影は production-config-audit.mjs と同型だが import しない。
 * あちらは audit contract 保護対象（変更すると PR ごとに trusted dispatch が
 * 要る）のため、export 追加を避けてこの script に閉じる。
 */

const PROJECTS = ['product', 'web'] as const;

/**
 * 台帳（schema）に無いが Vercel Production に存在してよい key。
 * 追加する時は必ず理由を書く。空にできている状態が正常で、ここが増えるのは
 * 台帳へ登録できない構造的理由がある時だけ。
 */
export const allowedNonLedgerKeys: ReadonlyMap<string, string> = new Map<string, string>([]);

export type EnvKeyEntry = { key: string; targets: string[] };

/** API 応答を key / targets のみに射影する。想定外の形は fail closed で throw。 */
export function normalizeEnvKeys(response: unknown): EnvKeyEntry[] {
  if (
    !response ||
    typeof response !== 'object' ||
    !Array.isArray((response as { envs?: unknown }).envs)
  ) {
    throw new Error('Vercel environment metadata response is invalid');
  }

  return (response as { envs: unknown[] }).envs.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { key, target } = entry as { key?: unknown; target?: unknown };
    if (typeof key !== 'string') return [];
    const targets = Array.isArray(target)
      ? target.filter((item): item is string => typeof item === 'string')
      : [];
    return [{ key, targets }];
  });
}

export function buildLedger(): ReadonlySet<string> {
  return new Set(onePasswordEnvSchema.map((entry) => entry.envName));
}

/** Production target の key のうち、台帳にも allowlist にも無いものを返す（重複除去・sort 済み）。 */
export function findUnlistedKeys(
  entries: readonly EnvKeyEntry[],
  ledger: ReadonlySet<string>,
  allowlist: ReadonlyMap<string, string> = allowedNonLedgerKeys,
): string[] {
  const unlisted = entries
    .filter((entry) => entry.targets.includes('production'))
    .map((entry) => entry.key)
    .filter((key) => !ledger.has(key) && !allowlist.has(key));
  return Array.from(new Set(unlisted)).sort();
}

async function fetchEnvMetadata(
  projectName: string,
  token: string,
  teamId: string,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const url = new URL(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectName)}/env`);
  url.searchParams.set('teamId', teamId);

  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    // レスポンス本文は secret を含みうるため、status 以外を echo しない
    throw new Error(
      `Vercel environment metadata request failed for project: ${projectName} (status ${response.status})`,
    );
  }
  return response.json();
}

export async function runReplicaCheck({
  token,
  teamId,
  fetchImpl = fetch,
}: {
  token: string | undefined;
  teamId: string | undefined;
  fetchImpl?: typeof fetch;
}): Promise<string[]> {
  if (!token) throw new Error('VERCEL_TOKEN is required for replica check');
  if (!teamId) throw new Error('VERCEL_TEAM_ID is required for replica check');

  const ledger = buildLedger();
  const findings: string[] = [];
  for (const projectName of PROJECTS) {
    const response = await fetchEnvMetadata(projectName, token, teamId, fetchImpl);
    for (const key of findUnlistedKeys(normalizeEnvKeys(response), ledger)) {
      findings.push(
        `${projectName}: ${key} は Vercel Production にあるが 1Password 台帳（scripts/env/schema.ts）に無い`,
      );
    }
  }
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runReplicaCheck({
    token: process.env.VERCEL_TOKEN,
    teamId: process.env.VERCEL_TEAM_ID,
  })
    .then((findings) => {
      if (findings.length === 0) {
        console.log(
          'Replica check passed: Vercel Production の全 key が 1Password 台帳に載っている',
        );
        return;
      }
      for (const finding of findings) {
        console.log(`NG ${finding}`);
      }
      console.log(
        '対応: master（1Password）へ登録して scripts/env/schema.ts に entry を足すか、Vercel 側から撤去する（docs/operations/secrets.md §External Replicas）',
      );
      process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'replica check failed');
      process.exitCode = 1;
    });
}
