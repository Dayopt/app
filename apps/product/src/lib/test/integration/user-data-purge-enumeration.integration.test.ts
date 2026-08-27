/**
 * account-preserving purge の列挙漏れを機械で止める（#2444）。
 *
 * 実行: USE_LOCAL_DB=true pnpm test:integration
 * RUN_LOCAL が false だと describe ごと skip されるため、**passed 件数を読む**こと。
 * skipped は緑に見えるが何も検証していない。
 *
 * `public.delete_all_user_data_command_v3` は `auth.users` を消さずにユーザーデータだけを
 * 消す。消す対象は**関数本文の列挙**であり、新しいテーブルを足した人が列挙にも足すことを
 * 覚えていないと静かに漏れる。実際 2 回起きている:
 *
 *   1 回目 — #2162（2026-08-18）で `tags` を `activities` / `categories` / `segments` へ
 *            置き換えた時。旧モデルは消えるのに後継が残るという逆転が 9 日間続いた
 *   2 回目 — #2433 の plan review で新規 `undo_receipts` について同じ指摘が出た時、
 *            裏取りで 1 回目が発覚した（#2444）
 *
 * **列挙を人が維持する限り 3 回目が来る。** この test はその class を閉じるためにある。
 * `user_id` を持つ `public` の table は、次のどれか 1 つに必ず該当しなければならない:
 *
 *   A. purge が直接 DELETE する
 *   B. A のいずれかから ON DELETE CASCADE で到達できる（＝消える）
 *   C. 下の allowlist に「消さない理由」付きで載っている
 *
 * どれにも当てはまらない table が現れたらこの test が落ちる。新規テーブルを足した PR は
 * その場で「消すのか、消さないのか」を決めさせられる。
 */
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const RUN_LOCAL = process.env.USE_LOCAL_DB === 'true';

const PURGE_FUNCTION = 'delete_all_user_data_command_v3';

/**
 * purge が**意図的に消さない** table と、その理由。
 *
 * 「漏れ」と「意図的な保持」が見分けられない状態そのものが再発の温床だったので、
 * ここに理由まで書く。次に棚卸しする人が同じ table を ⚠️ として拾い直さずに済む。
 *
 * mfa_recovery_codes / oauth_audit_log / product_events の 3 件は 2026-08-27 に
 * User 裁可で「3 件とも現状維持」と確定した（#2444）。
 */
const INTENTIONALLY_RETAINED: Record<string, string> = {
  mfa_recovery_codes:
    'アカウントを保持するなら資格情報も保持する（purge 後もログインできる必要がある）。2026-08-27 User 裁可',
  oauth_audit_log: '監査ログを削除対象にすると監査の意味が消える。2026-08-27 User 裁可',
  product_events: '個人データ性が低い分析イベント。2026-08-27 User 裁可',
  mcp_mutation_receipts:
    '削除ではなく tombstone 方式（purged_generation / purged_at を打つ）。設計どおり',
  oauth_authorization_codes: '削除ではなく consumed_at を打って無効化する（OAuth ライフサイクル）',
  oauth_connections: '削除ではなく revoked_at / revoked_reason を打って失効させる',
  oauth_tokens: '削除ではなく revoked_at を打って失効させる',
};

function runOwnerSql(sql: string): string {
  const result = spawnSync(
    'psql',
    [
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-h',
      '127.0.0.1',
      '-p',
      '54322',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-c',
      sql,
    ],
    { encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' } },
  );
  if (result.status !== 0) {
    throw new Error(`psql failed (${result.status}): ${result.stderr}`);
  }
  return result.stdout.trim();
}

describe.skipIf(!RUN_LOCAL)('account-preserving purge の列挙 (#2444)', () => {
  /**
   * A ∪ B の集合を **DB 側で** 計算する。
   *
   * B（CASCADE 到達）を再帰で辿るのが要点。子テーブルを足した時に purge の列挙へ
   * 足す必要が無いのは「親が消えれば CASCADE で消えるから」であって、その事実は
   * pg_constraint に書いてある。人間の記憶ではなくカタログから導く。
   */
  const purgeCoverageSql = `
    WITH purge_body AS (
      SELECT routine.prosrc AS src
      FROM pg_proc AS routine
      JOIN pg_namespace AS ns ON ns.oid = routine.pronamespace
      WHERE ns.nspname = 'public' AND routine.proname = '${PURGE_FUNCTION}'
    ),
    user_tables AS (
      SELECT relation.oid, relation.relname
      FROM pg_class AS relation
      JOIN pg_namespace AS ns ON ns.oid = relation.relnamespace
      JOIN pg_attribute AS attribute
        ON attribute.attrelid = relation.oid
       AND attribute.attname = 'user_id'
       AND attribute.attnum > 0
       AND NOT attribute.attisdropped
      WHERE ns.nspname = 'public' AND relation.relkind = 'r'
    ),
    -- A: purge 本文が直接 DELETE している table
    directly_deleted AS (
      SELECT user_tables.oid, user_tables.relname
      FROM user_tables, purge_body
      WHERE purge_body.src ~ ('DELETE FROM public\\.' || user_tables.relname || '\\M')
    ),
    -- B: A から ON DELETE CASCADE の辺だけを辿って到達できる table
    cascade_reachable AS (
      WITH RECURSIVE walk(oid) AS (
        SELECT oid FROM directly_deleted
        UNION
        SELECT child.conrelid
        FROM pg_constraint AS child
        JOIN walk ON walk.oid = child.confrelid
        WHERE child.contype = 'f' AND child.confdeltype = 'c'
      )
      SELECT oid FROM walk
    )
    SELECT user_tables.relname,
           (user_tables.oid IN (SELECT oid FROM directly_deleted)) AS directly_deleted,
           (user_tables.oid IN (SELECT oid FROM cascade_reachable)) AS cascade_reachable
    FROM user_tables
    ORDER BY user_tables.relname;
  `;

  function coverage() {
    return runOwnerSql(purgeCoverageSql)
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [relname, direct, cascade] = line.split('|');
        return {
          relname,
          directlyDeleted: direct === 't',
          cascadeReachable: cascade === 't',
        };
      });
  }

  it('user_id を持つ public table が 1 件以上見つかる（クエリ自体が空振りしていない）', () => {
    // 空配列に対する every() は自明に true になるので、本命の test が「何も検査せず緑」に
    // なる経路を先に塞ぐ。
    expect(coverage().length).toBeGreaterThan(10);
  });

  it('purge が消さない table は、すべて理由付きで allowlist に載っている', () => {
    const unaccounted = coverage()
      .filter((row) => !row.cascadeReachable)
      .filter((row) => !(row.relname in INTENTIONALLY_RETAINED))
      .map((row) => row.relname);

    // 落ちた時に「何をすればいいか」がメッセージだけで分かるようにする。
    expect(
      unaccounted,
      unaccounted.length === 0
        ? ''
        : [
            `account-preserving purge から漏れている table: ${unaccounted.join(', ')}`,
            '',
            '次のどちらかを選ぶこと:',
            `  - 消す  → ${PURGE_FUNCTION} の列挙へ DELETE を追加する（新しい migration で）`,
            '  - 消さない → この test の INTENTIONALLY_RETAINED へ理由付きで追加する',
            '',
            'どちらでもない状態＝「決め忘れ」であり、#2162 / #2444 で 2 回起きた漏れの正体。',
          ].join('\n'),
    ).toEqual([]);
  });

  it('allowlist に死んだエントリが残っていない', () => {
    // 消す方針へ変えた table が allowlist に残り続けると、次に本当に漏れた時の
    // 検出力が落ちる。allowlist 自体の鮮度もここで守る。
    const present = new Set(coverage().map((row) => row.relname));
    const stale = Object.keys(INTENTIONALLY_RETAINED).filter((name) => {
      if (!present.has(name)) return true; // table 自体が消えた
      const row = coverage().find((entry) => entry.relname === name);
      return row?.cascadeReachable === true; // 消える側になったのに allowlist に残っている
    });
    expect(stale).toEqual([]);
  });

  it('#2444 の回帰: 分類モデル 3 件が purge 対象に入っている', () => {
    const rows = coverage();
    for (const name of ['activities', 'categories', 'segments']) {
      const row = rows.find((entry) => entry.relname === name);
      expect(row, `${name} が user_id を持つ public table として見つからない`).toBeDefined();
      expect(row?.directlyDeleted, `${name} が purge の列挙に無い（#2444 の回帰）`).toBe(true);
    }
  });

  it('#2433: undo substrate が purge 対象に入っている', () => {
    const rows = coverage();
    // 親だけを直接 DELETE し、子は CASCADE で落とす設計。
    expect(rows.find((entry) => entry.relname === 'undo_receipts')?.directlyDeleted).toBe(true);
    for (const name of ['undo_receipt_effects', 'undo_receipt_field_changes']) {
      expect(
        rows.find((entry) => entry.relname === name)?.cascadeReachable,
        `${name} が CASCADE で到達できない`,
      ).toBe(true);
    }
  });

  it('CASCADE 頼みの table が実際に CASCADE 経路を持つ', () => {
    // 「列挙しなくてよい」と判断した根拠そのものを固定する。
    const rows = coverage();
    for (const name of ['segment_activities', 'calendar_connection_calendars']) {
      const row = rows.find((entry) => entry.relname === name);
      expect(row?.directlyDeleted, `${name} は直接 DELETE していない前提`).toBe(false);
      expect(row?.cascadeReachable, `${name} が CASCADE で到達できない`).toBe(true);
    }
  });
});
