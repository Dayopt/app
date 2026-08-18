// レーン H。三状態部分更新 × 無効なタグ の組み合わせを実 DB に対して固定する。
//
// 既存の三状態テスト（mcp-plan-mutations-apply / mcp-record-mutations-apply）は
// 「有効なタグ」と「明示 null」の 2 経路しか通らない。present=true で
// アーカイブ済み / 他ユーザーのタグを指した時に assert_active_timeblock_tag_v1 が
// 実際に発火するかは無検証だった。ここを塞ぐ。
//
// activity 参照への切替後は、同じ組み合わせを activity 版で複製する。

import { createClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/lib/database';
import { hashToken } from '@/lib/oauth-server';

import { deriveStage1PkceS256Challenge } from './mcp-stage1-crypto';

const LOCAL_DB_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RUN_LOCAL = process.env.USE_LOCAL_DB === 'true';

const admin = createClient<Database>(LOCAL_DB_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userId = crypto.randomUUID();
const foreignId = crypto.randomUUID();
const email = `mcp-tristate-${userId}@example.com`;
const resource = 'https://mcp.dayopt.app';
const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect';
const challenge = deriveStage1PkceS256Challenge('v'.repeat(43));
const dbNull = null as never;

interface WriteAuthorization {
  accessTokenId: string;
  connectionId: string;
}

function at(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

async function readMutationControl() {
  const { data, error } = await admin
    .from('mcp_mutation_control')
    .select('writes_enabled, enabled_client_ids, revision')
    .eq('singleton_key', true)
    .single();
  if (error) throw error;
  return data;
}

async function setClientWriteControl(enabled: boolean) {
  const current = await readMutationControl();
  const { error } = await admin.rpc('set_mcp_client_write_control_v1', {
    p_client_id: 'chatgpt',
    p_enabled: enabled,
    p_expected_revision: current.revision,
  });
  if (error) throw error;
}

async function setMutationControl(writesEnabled: boolean) {
  const current = await readMutationControl();
  const { error } = await admin.rpc('set_mcp_mutation_control_v1', {
    p_writes_enabled: writesEnabled,
    p_expected_revision: current.revision,
  });
  if (error) throw error;
}

async function createWriteAuthorization(): Promise<WriteAuthorization> {
  const code = `code-${crypto.randomUUID()}`;
  const { data: connectionId, error: grantError } = await admin.rpc(
    'create_oauth_authorization_grant_v2',
    {
      p_user_id: userId,
      p_client_id: 'chatgpt',
      p_resource_uri: resource,
      p_scopes: ['read:entries', 'write:plans', 'delete:plans', 'write:records', 'delete:records'],
      p_code_hash: hashToken(code),
      p_redirect_uri: redirectUri,
      p_code_challenge: challenge,
      p_write_enabled: true,
    },
  );
  if (grantError || !connectionId) throw grantError ?? new Error('Connection was not created');

  const { data: exchange, error: exchangeError } = await admin.rpc(
    'exchange_oauth_authorization_code_v2',
    {
      p_code_hash: hashToken(code),
      p_client_id: 'chatgpt',
      p_redirect_uri: redirectUri,
      p_resource_uri: resource,
      p_code_challenge: challenge,
      p_refresh_hash: hashToken(`dop_rt_${crypto.randomUUID()}`),
      p_access_hash: hashToken(`dop_at_${crypto.randomUUID()}`),
    },
  );
  if (exchangeError) throw exchangeError;
  const accessTokenId = exchange?.[0]?.access_id;
  if (!accessTokenId) throw new Error('Access token was not issued');

  return { accessTokenId, connectionId };
}

async function insertTag(input: { userId: string; name: string; archived?: boolean }) {
  const { data, error } = await admin
    .from('tags')
    .insert({
      user_id: input.userId,
      name: input.name,
      sort_order: 0,
      is_active: true,
      archived_at: input.archived ? new Date().toISOString() : null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

describe.skipIf(!RUN_LOCAL)('MCP tri-state tag patch guards', () => {
  beforeAll(async () => {
    for (const id of [userId, foreignId]) {
      const { error } = await admin.auth.admin.createUser({
        id,
        email: id === userId ? email : `mcp-tristate-foreign-${id}@example.com`,
        password: 'test-password-123',
        email_confirm: true,
      });
      if (error) throw error;
    }
    const { error: profileError } = await admin
      .from('profiles')
      .update({ subscription_status: 'active' })
      .eq('id', userId);
    if (profileError) throw profileError;

    await setClientWriteControl(true);
    await setMutationControl(true);
  });

  afterEach(async () => {
    for (const id of [userId, foreignId]) {
      await admin.from('records').delete().eq('user_id', id);
      await admin.from('plans').delete().eq('user_id', id);
      await admin.from('tags').delete().eq('user_id', id);
    }
  });

  afterAll(async () => {
    await setMutationControl(false);
    await setClientWriteControl(false);
    for (const id of [userId, foreignId]) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it('present=true でアーカイブ済みタグを指す Plan patch を DT014 で拒否する', async () => {
    const authorization = await createWriteAuthorization();
    const archived = await insertTag({ userId, name: 'archived', archived: true });
    const { data: plan } = await admin
      .rpc('create_plan_command_v1', {
        p_user_id: userId,
        p_title: 'tristate probe',
        p_note: dbNull,
        p_tag_id: dbNull,
        p_external_calendar_event_id: dbNull,
        p_source: 'manual',
        p_start_at: at(60 * 60_000),
        p_end_at: at(2 * 60 * 60_000),
      })
      .single();

    const { error } = await admin
      .rpc('apply_mcp_plan_update_v1', {
        p_connection_id: authorization.connectionId,
        p_access_token_id: authorization.accessTokenId,
        p_operation_id: crypto.randomUUID(),
        p_plan_id: plan!.id,
        p_expected_updated_at: plan!.updated_at,
        p_title_present: false,
        p_title: dbNull,
        p_note_present: false,
        p_note: dbNull,
        p_tag_id_present: true,
        p_tag_id: archived.id as never,
        p_start_at_present: false,
        p_start_at: dbNull,
        p_end_at_present: false,
        p_end_at: dbNull,
      })
      .single();

    expect(error?.code).toBe('DT014');
  });

  it('present=true で他ユーザーのタグを指す Plan patch を DT001 で拒否する', async () => {
    const authorization = await createWriteAuthorization();
    const foreignTag = await insertTag({ userId: foreignId, name: 'foreign' });
    const { data: plan } = await admin
      .rpc('create_plan_command_v1', {
        p_user_id: userId,
        p_title: 'tristate probe',
        p_note: dbNull,
        p_tag_id: dbNull,
        p_external_calendar_event_id: dbNull,
        p_source: 'manual',
        p_start_at: at(60 * 60_000),
        p_end_at: at(2 * 60 * 60_000),
      })
      .single();

    const { error } = await admin
      .rpc('apply_mcp_plan_update_v1', {
        p_connection_id: authorization.connectionId,
        p_access_token_id: authorization.accessTokenId,
        p_operation_id: crypto.randomUUID(),
        p_plan_id: plan!.id,
        p_expected_updated_at: plan!.updated_at,
        p_title_present: false,
        p_title: dbNull,
        p_note_present: false,
        p_note: dbNull,
        p_tag_id_present: true,
        p_tag_id: foreignTag.id as never,
        p_start_at_present: false,
        p_start_at: dbNull,
        p_end_at_present: false,
        p_end_at: dbNull,
      })
      .single();

    expect(error?.code).toBe('DT001');
  });

  it('present=false なら、付与済みタグが後からアーカイブされても patch は通る', async () => {
    // UI 経路と同じ非対称が MCP 経路でも成立することを固定する。
    const authorization = await createWriteAuthorization();
    const tag = await insertTag({ userId, name: 'later-archived' });
    const { data: plan } = await admin
      .rpc('create_plan_command_v1', {
        p_user_id: userId,
        p_title: 'tristate probe',
        p_note: dbNull,
        p_tag_id: tag.id as never,
        p_external_calendar_event_id: dbNull,
        p_source: 'manual',
        p_start_at: at(60 * 60_000),
        p_end_at: at(2 * 60 * 60_000),
      })
      .single();

    await admin.from('tags').update({ archived_at: new Date().toISOString() }).eq('id', tag.id);

    const { error } = await admin
      .rpc('apply_mcp_plan_update_v1', {
        p_connection_id: authorization.connectionId,
        p_access_token_id: authorization.accessTokenId,
        p_operation_id: crypto.randomUUID(),
        p_plan_id: plan!.id,
        p_expected_updated_at: plan!.updated_at,
        p_title_present: true,
        p_title: 'retitled without touching the tag',
        p_note_present: false,
        p_note: dbNull,
        p_tag_id_present: false,
        p_tag_id: dbNull,
        p_start_at_present: false,
        p_start_at: dbNull,
        p_end_at_present: false,
        p_end_at: dbNull,
      })
      .single();

    expect(error).toBeNull();
  });

  it('present=true で明示 null なら、アーカイブ検証を経ずにタグを外せる', async () => {
    const authorization = await createWriteAuthorization();
    const tag = await insertTag({ userId, name: 'to-clear' });
    const { data: plan } = await admin
      .rpc('create_plan_command_v1', {
        p_user_id: userId,
        p_title: 'tristate probe',
        p_note: dbNull,
        p_tag_id: tag.id as never,
        p_external_calendar_event_id: dbNull,
        p_source: 'manual',
        p_start_at: at(60 * 60_000),
        p_end_at: at(2 * 60 * 60_000),
      })
      .single();

    await admin.from('tags').update({ archived_at: new Date().toISOString() }).eq('id', tag.id);

    const { error } = await admin
      .rpc('apply_mcp_plan_update_v1', {
        p_connection_id: authorization.connectionId,
        p_access_token_id: authorization.accessTokenId,
        p_operation_id: crypto.randomUUID(),
        p_plan_id: plan!.id,
        p_expected_updated_at: plan!.updated_at,
        p_title_present: false,
        p_title: dbNull,
        p_note_present: false,
        p_note: dbNull,
        p_tag_id_present: true,
        p_tag_id: dbNull,
        p_start_at_present: false,
        p_start_at: dbNull,
        p_end_at_present: false,
        p_end_at: dbNull,
      })
      .single();

    expect(error).toBeNull();

    const { data: after } = await admin.from('plans').select('tag_id').eq('id', plan!.id).single();
    expect(after?.tag_id).toBeNull();
  });

  it('アーカイブ済みタグを指す MCP Record 作成を DT014 で拒否する', async () => {
    const authorization = await createWriteAuthorization();
    const archived = await insertTag({ userId, name: 'archived', archived: true });

    const { error } = await admin
      .rpc('apply_mcp_record_create_v1', {
        p_connection_id: authorization.connectionId,
        p_access_token_id: authorization.accessTokenId,
        p_operation_id: crypto.randomUUID(),
        p_title: 'tristate probe',
        p_note: dbNull,
        p_tag_id: archived.id as never,
        p_plan_id: dbNull,
        p_start_at: at(-2 * 60 * 60_000),
        p_end_at: at(-60 * 60_000),
      })
      .single();

    expect(error?.code).toBe('DT014');
  });
});
