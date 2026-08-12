/**
 * private.cleanup_calendar_authority_retention_internal_v1 の実挙動を固定する。
 *
 * #1994: この関数は 20260730090015_fenced_calendar_revoke_worker.sql で追加されたが、
 * 呼び出す cron が存在せず、`calendar_revoke_operations` / `calendar_authority_command_receipts`
 * / `calendar_oauth_attempts` の `delete_after` 超過行と孤立 subject fence が際限なく
 * 蓄積していた。20260812041309_schedule_calendar_authority_retention_cleanup.sql で
 * pg_cron に配線した。ここでは関数の削除対象そのものを固定し、cron 登録の schedule/command
 * が migration のリテラルと一致していることも別途 assert する（risk-reviewer 指摘で追加）。
 *
 * 関数は `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role` されており、
 * pg_cron が実行する owner 権限でしか呼べない設計（overview.md 相当の owner-only 契約）。
 * そのため supabase-js client ではなく psql 直叩きで呼ぶ。
 */

import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

const RUN_LOCAL = process.env.USE_LOCAL_DB === 'true';

function createRunProjectNumber(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (value, index) =>
    String(index === 0 ? (value % 9) + 1 : value % 10),
  ).join('');
}

const projectKey = createRunProjectNumber();
const oauthClientId = `${projectKey}-dayoptcalendar.apps.googleusercontent.com`;
const userId = crypto.randomUUID();
const userEmail = `calendar-authority-retention-cleanup-${userId}@example.com`;

function ownerSql(sql: string, variables: Record<string, string> = {}): string {
  const result = spawnSync(
    'psql',
    [
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      ...Object.entries(variables).flatMap(([name, value]) => ['-v', `${name}=${value}`]),
      '-h',
      '127.0.0.1',
      '-p',
      '54322',
      '-U',
      'postgres',
      '-d',
      'postgres',
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, PGPASSWORD: 'postgres' },
      input: sql,
    },
  );

  if (result.status !== 0) {
    throw new Error(`Calendar authority retention cleanup SQL failed: ${result.stderr}`);
  }
  // 複数 statement を 1 回の呼び出しで流す時、必要なのは最後の statement の結果だけ
  // （serviceRoleSql が前置する set_config の戻り値を拾わないため）。
  return result.stdout.trim().split('\n').at(-1) ?? '';
}

// provision_calendar_authority_project_v1 / get_or_create_calendar_subject_fence_v1 は
// service_role JWT claim を要求する（calendar-revoke-authority.integration.test.ts と同型）。
function serviceRoleSql(sql: string, variables: Record<string, string> = {}): string {
  return ownerSql(
    `SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  FALSE
);
${sql}`,
    variables,
  );
}

function cleanupFixture(): void {
  ownerSql(
    `DELETE FROM private.calendar_revoke_operations WHERE project_fence_id IN (
  SELECT id FROM private.calendar_authority_fences WHERE project_key = :'project_key'
);
DELETE FROM private.calendar_authority_command_receipts WHERE project_fence_id IN (
  SELECT id FROM private.calendar_authority_fences WHERE project_key = :'project_key'
);
DELETE FROM private.calendar_oauth_attempts WHERE project_fence_id IN (
  SELECT id FROM private.calendar_authority_fences WHERE project_key = :'project_key'
);
DELETE FROM private.calendar_authority_fences WHERE project_key = :'project_key';
DELETE FROM private.calendar_authority_projects WHERE project_key = :'project_key';
DELETE FROM auth.users WHERE id = :'user_id'::UUID;`,
    { project_key: projectKey, user_id: userId },
  );
}

function provisionProject(): { projectFenceId: string } {
  serviceRoleSql(
    `SELECT public.provision_calendar_authority_project_v1(:'project_key', :'oauth_client_id');
UPDATE private.calendar_authority_projects
SET activation_version = 1, activated_at = pg_catalog.clock_timestamp()
WHERE project_key = :'project_key';
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  :'user_id'::UUID, 'authenticated', 'authenticated', :'user_email', '', '{}'::JSONB, '{}'::JSONB,
  pg_catalog.now(), pg_catalog.now()
);`,
    {
      oauth_client_id: oauthClientId,
      project_key: projectKey,
      user_email: userEmail,
      user_id: userId,
    },
  );
  const projectFenceId = ownerSql(
    `SELECT id FROM private.calendar_authority_fences WHERE project_key = :'project_key' AND scope_kind = 'project';`,
    { project_key: projectKey },
  );
  return { projectFenceId };
}

function createSubjectFence(providerAccountId: string): string {
  return serviceRoleSql(
    `SELECT private.get_or_create_calendar_subject_fence_v1(:'project_key', :'provider_account_id');`,
    { project_key: projectKey, provider_account_id: providerAccountId },
  );
}

function runCleanup(limit = 1000): number {
  return Number(
    ownerSql(`SELECT private.cleanup_calendar_authority_retention_internal_v1(${limit});`),
  );
}

describe.skipIf(!RUN_LOCAL)('calendar authority retention cleanup', () => {
  afterEach(() => {
    cleanupFixture();
  });

  it('delete_after を過ぎた revoke operation / receipt / oauth attempt を削除し、未満は残す', async () => {
    const { projectFenceId } = provisionProject();
    const subjectFenceId = createSubjectFence('retention-subject-due');
    const connectionId = crypto.randomUUID();

    const dueOperationId = crypto.randomUUID();
    const notDueOperationId = crypto.randomUUID();
    const dueReceiptOperationId = crypto.randomUUID();
    const dueAttemptId = crypto.randomUUID();

    ownerSql(
      `INSERT INTO private.calendar_revoke_operations (
  operation_id, project_fence_id, subject_fence_id, subject_fence_epoch, source_connection_id,
  operation_kind, request_digest, state, initial_result, settled_at, delete_after
) VALUES
(
  :'due_operation_id'::UUID, :'project_fence_id'::UUID, :'subject_fence_id'::UUID, 0,
  :'connection_id'::UUID, 'disconnect', decode(repeat('00', 32), 'hex'), 'revoked', 'queued',
  pg_catalog.clock_timestamp() - INTERVAL '91 days',
  pg_catalog.clock_timestamp() - INTERVAL '1 day'
),
(
  :'not_due_operation_id'::UUID, :'project_fence_id'::UUID, :'subject_fence_id'::UUID, 0,
  :'connection_id'::UUID, 'disconnect', decode(repeat('11', 32), 'hex'), 'revoked', 'queued',
  pg_catalog.clock_timestamp() - INTERVAL '1 day',
  pg_catalog.clock_timestamp() + INTERVAL '89 days'
);

INSERT INTO private.calendar_authority_command_receipts (
  operation_id, command_kind, project_fence_id, subject_fence_id, source_connection_id,
  resource_connection_id, request_digest, result, created_at, delete_after
) VALUES (
  :'due_receipt_operation_id'::UUID, 'connection_save', :'project_fence_id'::UUID,
  :'subject_fence_id'::UUID, :'connection_id'::UUID, :'connection_id'::UUID,
  decode(repeat('22', 32), 'hex'), 'saved',
  -- retention CHECK は delete_after <= created_at + 90 days。created_at と delete_after を
  -- 別々の clock_timestamp() 呼び出しで計算すると、実行順序のわずかなずれで 90 日をわずかに
  -- 超えうる（実測）ため、2 日の余裕を持たせる。
  pg_catalog.clock_timestamp() - INTERVAL '10 days',
  pg_catalog.clock_timestamp() - INTERVAL '1 day'
);

INSERT INTO private.calendar_oauth_attempts (
  id, project_fence_id, user_id, state_digest, verifier_digest, operation_id, connection_id,
  data_generation, project_epoch, created_at, expires_at, delete_after
) VALUES (
  :'due_attempt_id'::UUID, :'project_fence_id'::UUID, :'user_id'::UUID,
  decode(repeat('33', 32), 'hex'), decode(repeat('44', 32), 'hex'),
  gen_random_uuid(), :'connection_id'::UUID, 0, 0,
  pg_catalog.clock_timestamp() - INTERVAL '10 minutes',
  pg_catalog.clock_timestamp() - INTERVAL '5 minutes',
  pg_catalog.clock_timestamp() - INTERVAL '1 second'
);`,
      {
        connection_id: connectionId,
        due_attempt_id: dueAttemptId,
        due_operation_id: dueOperationId,
        due_receipt_operation_id: dueReceiptOperationId,
        not_due_operation_id: notDueOperationId,
        project_fence_id: projectFenceId,
        subject_fence_id: subjectFenceId,
        user_id: userId,
      },
    );

    const deletedCount = runCleanup();
    expect(deletedCount).toBeGreaterThanOrEqual(3);

    expect(
      ownerSql(
        `SELECT
  (SELECT pg_catalog.count(*) FROM private.calendar_revoke_operations WHERE operation_id = :'due_operation_id'::UUID) || '|' ||
  (SELECT pg_catalog.count(*) FROM private.calendar_revoke_operations WHERE operation_id = :'not_due_operation_id'::UUID) || '|' ||
  (SELECT pg_catalog.count(*) FROM private.calendar_authority_command_receipts WHERE operation_id = :'due_receipt_operation_id'::UUID) || '|' ||
  (SELECT pg_catalog.count(*) FROM private.calendar_oauth_attempts WHERE id = :'due_attempt_id'::UUID);`,
        {
          due_attempt_id: dueAttemptId,
          due_operation_id: dueOperationId,
          due_receipt_operation_id: dueReceiptOperationId,
          not_due_operation_id: notDueOperationId,
        },
      ),
    ).toBe('0|1|0|0');
  });

  it('参照が無い ready subject fence を削除し、参照が残るものは残す', async () => {
    const { projectFenceId } = provisionProject();
    const orphanFenceId = createSubjectFence('retention-subject-orphan');
    const referencedFenceId = createSubjectFence('retention-subject-referenced');

    // 参照ありにするため receipt を 1 件貼る（delete_after は未来 = cleanup 対象外の receipt）。
    ownerSql(
      `INSERT INTO private.calendar_authority_command_receipts (
  operation_id, command_kind, project_fence_id, subject_fence_id, source_connection_id,
  resource_connection_id, request_digest, result, created_at, delete_after
) VALUES (
  gen_random_uuid(), 'connection_save', :'project_fence_id'::UUID, :'referenced_fence_id'::UUID,
  gen_random_uuid(), gen_random_uuid(), decode(repeat('55', 32), 'hex'), 'saved',
  -- retention CHECK は delete_after <= created_at + 90 days。created_at と delete_after を
  -- 別々の clock_timestamp() 呼び出しで計算すると実行順序のわずかなずれで超えうるため、
  -- 2 日の余裕を持たせる。
  pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp() + INTERVAL '88 days'
);`,
      { project_fence_id: projectFenceId, referenced_fence_id: referencedFenceId },
    );

    runCleanup();

    expect(
      ownerSql(
        `SELECT
  EXISTS(SELECT 1 FROM private.calendar_authority_fences WHERE id = :'orphan_fence_id'::UUID) || '|' ||
  EXISTS(SELECT 1 FROM private.calendar_authority_fences WHERE id = :'referenced_fence_id'::UUID);`,
        { orphan_fence_id: orphanFenceId, referenced_fence_id: referencedFenceId },
      ),
      // boolean を `||` で text と連結すると暗黙 cast は 'true'/'false'
      // （psql 表示上の 't'/'f' とは別）。
    ).toBe('false|true');
  });

  // グローバルな戻り値が 0 であることには依存しない。cleanup 関数は project 非スコープで
  // 動くため（overview 相当のコメント参照）、ローカル共有 DB に他 worktree / 他 test の
  // due 行が残っていると 0 という assertion 自体が flaky になる（risk-reviewer 指摘）。
  // 自前の fixture 行だけを対象に「消えた後、もう一度呼んでもエラーにならず消えたままである」
  // ことを確認する。
  it('自前の fixture 行を消した後に再実行してもエラーにならず、消えたままである（冪等性）', async () => {
    const { projectFenceId } = provisionProject();
    const attemptId = crypto.randomUUID();

    ownerSql(
      `INSERT INTO private.calendar_oauth_attempts (
  id, project_fence_id, user_id, state_digest, verifier_digest, operation_id, connection_id,
  data_generation, project_epoch, created_at, expires_at, delete_after
) VALUES (
  :'attempt_id'::UUID, :'project_fence_id'::UUID, :'user_id'::UUID,
  decode(repeat('66', 32), 'hex'), decode(repeat('77', 32), 'hex'),
  gen_random_uuid(), gen_random_uuid(), 0, 0,
  pg_catalog.clock_timestamp() - INTERVAL '10 minutes',
  pg_catalog.clock_timestamp() - INTERVAL '5 minutes',
  pg_catalog.clock_timestamp() - INTERVAL '1 second'
);`,
      { attempt_id: attemptId, project_fence_id: projectFenceId, user_id: userId },
    );

    // 単独の EXISTS() select は psql -t で 't'/'f'（`||` で text 連結した場合の
    // 'true'/'false' とは表記が異なる）。
    const stillExists = () =>
      ownerSql(
        `SELECT EXISTS(SELECT 1 FROM private.calendar_oauth_attempts WHERE id = :'attempt_id'::UUID);`,
        { attempt_id: attemptId },
      );

    expect(stillExists()).toBe('t');
    runCleanup();
    expect(stillExists()).toBe('f');

    // 2 回目はこの行についてはもう何もすることがない。エラーにならず、消えたままであること。
    expect(() => runCleanup()).not.toThrow();
    expect(stillExists()).toBe('f');
  });

  it('owner 以外（service_role を含む）は直接呼べない', () => {
    expect(() =>
      ownerSql(
        `SET ROLE service_role;
SELECT private.cleanup_calendar_authority_retention_internal_v1(10);`,
      ),
    ).toThrow(/permission denied/i);
  });

  it('cron に正しい関数名・引数・スケジュールで登録されている', () => {
    // 配線の契約は migration のリテラル比較で足りる（実行結果は上のテストが担保する）。
    // 2026-08-12: risk-reviewer 指摘で追加。expire-calendar-revoke-outbox の
    // external-authority-maintenance.integration.test.ts と同型のガード。
    expect(
      ownerSql(
        `SELECT schedule || '|' || command
FROM cron.job
WHERE jobname = 'cleanup-calendar-authority-retention';`,
      ),
    ).toBe('50 * * * *|SELECT private.cleanup_calendar_authority_retention_internal_v1(1000)');
  });
});
