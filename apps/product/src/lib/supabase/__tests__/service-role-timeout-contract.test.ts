import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { globSync } from 'glob';
import { describe, expect, it } from 'vitest';

/**
 * service-role client を作る module は、必ず外部呼び出しの上限を持つ、という契約。
 *
 * 上限が無いと Supabase 呼び出しが無制限になり、route の `maxDuration` だけが先に発火して
 * Function が kill される。handler は自前のエラー応答を返せず、Vercel の 504 になる。
 *
 * **特に危ないのは 1 回しか使えない grant を消費する経路**（OAuth authorization code、
 * refresh token rotation、Google の authorization code）。「サーバー側では成功したが
 * レスポンスが返らない」状態を作ると、client は再試行しても使用済みエラーで詰み、
 * ユーザーは認可からやり直しになる。内側で先に切れば正規のエラーを返せて回復できる。
 *
 * ## なぜ test にするか
 *
 * 2026-08-12、route の `maxDuration` を 300 → 60 秒へ下げた際に、外部レビューが同型の
 * 欠落を **3 つの factory で連続検出**した（`lib/oauth-server/db.ts` /
 * `lib/mcp/access-db.ts` / `external-calendar/server/connection-service.ts`）。3 件とも
 * 実際に漏れていた。1 件ずつ潰すのではなく class ごと閉じるためにこの test を置く
 * （`.claude/rules/workflow.md` §同型指摘の打ち切り「点の追加ではなく class ごと閉じる」）。
 *
 * ## この test の限界
 *
 * 判定は **file 単位**で「service-role client を作っていて `AbortSignal.timeout` が
 * 1 つも無い」を落とすだけ。同じ file 内に timeout 付きの呼び出しと timeout 無しの
 * client が同居するケースは検出できない。狙いは「新しい factory を timeout 無しで
 * 足す」を止めることで、そこは確実に落ちる。
 */
const SERVICE_ROLE_KEY_REFERENCE = 'SUPABASE_SERVICE_ROLE_KEY';

describe('service-role client timeout contract', () => {
  it('service-role client を作る module は必ず外部呼び出しの上限を持つ', () => {
    const sources = globSync('src/**/*.ts', {
      cwd: process.cwd(),
      dot: true,
      ignore: ['src/**/__tests__/**', 'src/lib/test/**'],
    }).sort();

    const inspected: string[] = [];
    const offenders: string[] = [];

    for (const relativePath of sources) {
      const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');

      const createsServiceRoleClient =
        source.includes(SERVICE_ROLE_KEY_REFERENCE) && /createClient[<(]/u.test(source);
      if (!createsServiceRoleClient) continue;

      inspected.push(relativePath);
      if (!source.includes('AbortSignal.timeout')) offenders.push(relativePath);
    }

    // 対象ゼロで緑になる（glob や判定条件が壊れた）のを防ぐ。
    expect(
      inspected.length,
      'service-role client を作る module を 1 つも検出できていない',
    ).toBeGreaterThan(5);

    expect(
      offenders,
      'service-role client に外部呼び出しの上限が無い。`global.fetch` で AbortSignal.timeout を設定するか、全 query へ .abortSignal(AbortSignal.timeout(...)) を渡すこと',
    ).toEqual([]);
  });
});
