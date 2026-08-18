// レーン H 下書き（着火後に apps/product/src/lib/test/integration/ へ移す）。
//
// 目的: タグ付与の防御層を「実 DB に対して」凍結する。
// 調査で判明したとおり、現状これらは DB レベルで一度も検証されていない:
//   - assert_active_timeblock_tag_v1 の SQL 本体（DT014 / DT001 の分岐）
//     → 既存の検証は手書きの偽 PostgREST レスポンスによる TS 側マッピングのみ
//   - enforce_plan_tag_owner / enforce_record_tag_owner トリガー
//     → トリガー名を参照する test ファイルがゼロ
//   - 三状態部分更新 × 無効なタグの組み合わせ
//
// 本ファイルは activity 参照への切替の「前」に置く。切替後は同じ不変条件を
// activity 版で複製し、両方を残す（変更前後の双方で成立すべき契約のため）。

import { createClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/lib/database';

const LOCAL_DB_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RUN_LOCAL = process.env.USE_LOCAL_DB === 'true';

const admin = createClient<Database>(LOCAL_DB_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ownerId = crypto.randomUUID();
const foreignId = crypto.randomUUID();
const dbNull = null as never;

type TagRow = Database['public']['Tables']['tags']['Row'];

function at(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

async function createUser(id: string): Promise<void> {
  const { error } = await admin.auth.admin.createUser({
    id,
    email: `tag-guards-${id}@example.com`,
    password: 'test-password-123',
    email_confirm: true,
  });
  if (error) throw error;
}

async function insertTag(input: {
  userId: string;
  name: string;
  archived?: boolean;
}): Promise<TagRow> {
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

function planArgs(tagId: string | null) {
  return {
    p_user_id: ownerId,
    p_title: 'guard probe',
    p_note: dbNull,
    p_tag_id: tagId as never,
    p_external_calendar_event_id: dbNull,
    p_source: 'manual',
    p_start_at: at(60 * 60_000),
    p_end_at: at(2 * 60 * 60_000),
  };
}

function recordArgs(tagId: string | null) {
  return {
    p_user_id: ownerId,
    p_title: 'guard probe',
    p_note: dbNull,
    p_tag_id: tagId as never,
    p_plan_id: dbNull,
    p_external_calendar_event_id: dbNull,
    p_source: 'manual',
    p_start_at: at(-2 * 60 * 60_000),
    p_end_at: at(-60 * 60_000),
  };
}

describe.skipIf(!RUN_LOCAL)('tag assignment guards (DB boundary)', () => {
  beforeAll(async () => {
    await createUser(ownerId);
    await createUser(foreignId);
  });

  afterEach(async () => {
    for (const id of [ownerId, foreignId]) {
      await admin.from('records').delete().eq('user_id', id);
      await admin.from('plans').delete().eq('user_id', id);
      await admin.from('tags').delete().eq('user_id', id);
    }
  });

  afterAll(async () => {
    await admin.auth.admin.deleteUser(ownerId);
    await admin.auth.admin.deleteUser(foreignId);
  });

  // --- assert_active_timeblock_tag_v1: アーカイブ拒否（DT014）---

  it('アーカイブ済みタグを指す Plan 作成を DT014 で拒否する', async () => {
    const tag = await insertTag({ userId: ownerId, name: 'archived', archived: true });

    const { error } = await admin.rpc('create_plan_command_v1', planArgs(tag.id)).single();

    expect(error?.code).toBe('DT014');
  });

  it('アーカイブ済みタグを指す Record 作成を DT014 で拒否する', async () => {
    const tag = await insertTag({ userId: ownerId, name: 'archived', archived: true });

    const { error } = await admin.rpc('create_record_command_v1', recordArgs(tag.id)).single();

    expect(error?.code).toBe('DT014');
  });

  it('アクティブなタグは付与できる（拒否側だけでなく通過側も固定する）', async () => {
    const tag = await insertTag({ userId: ownerId, name: 'active' });

    const { data, error } = await admin.rpc('create_plan_command_v1', planArgs(tag.id)).single();

    expect(error).toBeNull();
    expect(data?.tag_id).toBe(tag.id);
  });

  // --- assert_active_timeblock_tag_v1: 所有者拒否（DT001）---

  it('他ユーザーのタグを指す Plan 作成を DT001 で拒否する', async () => {
    const foreignTag = await insertTag({ userId: foreignId, name: 'foreign' });

    const { error } = await admin.rpc('create_plan_command_v1', planArgs(foreignTag.id)).single();

    // 所有者不一致は「見つからない」に畳まれる（存在の有無を漏らさない）
    expect(error?.code).toBe('DT001');
  });

  it('他ユーザーのタグを指す Record 作成を DT001 で拒否する', async () => {
    const foreignTag = await insertTag({ userId: foreignId, name: 'foreign' });

    const { error } = await admin
      .rpc('create_record_command_v1', recordArgs(foreignTag.id))
      .single();

    expect(error?.code).toBe('DT001');
  });

  it('存在しないタグ ID を DT001 で拒否する', async () => {
    const { error } = await admin
      .rpc('create_plan_command_v1', planArgs(crypto.randomUUID()))
      .single();

    expect(error?.code).toBe('DT001');
  });

  it('タグ未指定（NULL）は検証を素通りする', async () => {
    const { data, error } = await admin.rpc('create_plan_command_v1', planArgs(null)).single();

    expect(error).toBeNull();
    expect(data?.tag_id).toBeNull();
  });

  // --- 意図的な非対称: 変更が無ければ再検証しない ---

  it('タグを変更しない更新では、付与済みのタグがアーカイブ済みでも通る', async () => {
    // 過去に付与 → 後からアーカイブ、という順序を作る。
    // update 側は `p_tag_id IS DISTINCT FROM v_plan.tag_id` の時だけ検証するため、
    // 無関係なフィールド更新は通るのが現行の意図的な挙動（過去のブロックを編集不能にしない）。
    const tag = await insertTag({ userId: ownerId, name: 'later-archived' });
    const { data: plan, error: createError } = await admin
      .rpc('create_plan_command_v1', planArgs(tag.id))
      .single();
    expect(createError).toBeNull();

    await admin.from('tags').update({ archived_at: new Date().toISOString() }).eq('id', tag.id);

    const { error } = await admin
      .rpc('update_plan_command_v1', {
        p_user_id: ownerId,
        p_plan_id: plan!.id,
        p_expected_updated_at: plan!.updated_at,
        p_title: 'retitled without touching the tag',
        p_note: dbNull,
        p_tag_id: tag.id as never,
        p_external_calendar_event_id: dbNull,
        p_start_at: plan!.start_at,
        p_end_at: plan!.end_at,
      })
      .single();

    expect(error).toBeNull();
  });

  it('アーカイブ済みタグへ「変更する」更新は DT014 で拒否する', async () => {
    const active = await insertTag({ userId: ownerId, name: 'active' });
    const archived = await insertTag({ userId: ownerId, name: 'archived', archived: true });
    const { data: plan } = await admin.rpc('create_plan_command_v1', planArgs(active.id)).single();

    const { error } = await admin
      .rpc('update_plan_command_v1', {
        p_user_id: ownerId,
        p_plan_id: plan!.id,
        p_expected_updated_at: plan!.updated_at,
        p_title: plan!.title,
        p_note: dbNull,
        p_tag_id: archived.id as never,
        p_external_calendar_event_id: dbNull,
        p_start_at: plan!.start_at,
        p_end_at: plan!.end_at,
      })
      .single();

    expect(error?.code).toBe('DT014');
  });

  // --- enforce_plan_tag_owner / enforce_record_tag_owner（RPC を迂回した直接書き込み）---

  it('直接 INSERT でも他ユーザーのタグを持つ Plan は書けない', async () => {
    const foreignTag = await insertTag({ userId: foreignId, name: 'foreign' });

    const { error } = await admin.from('plans').insert({
      user_id: ownerId,
      title: 'direct write bypassing the command RPC',
      tag_id: foreignTag.id,
      source: 'manual',
      start_at: at(60 * 60_000),
      end_at: at(2 * 60 * 60_000),
    });

    // DEFERRABLE CONSTRAINT TRIGGER が所有者不一致を弾く
    expect(error).not.toBeNull();
  });

  it('直接 INSERT でも他ユーザーのタグを持つ Record は書けない', async () => {
    const foreignTag = await insertTag({ userId: foreignId, name: 'foreign' });

    const { error } = await admin.from('records').insert({
      user_id: ownerId,
      title: 'direct write bypassing the command RPC',
      tag_id: foreignTag.id,
      source: 'manual',
      start_at: at(-2 * 60 * 60_000),
      end_at: at(-60 * 60_000),
    });

    expect(error).not.toBeNull();
  });

  it('既存 Plan の tag_id を他ユーザーのタグへ後から書き換えられない', async () => {
    const ownTag = await insertTag({ userId: ownerId, name: 'own' });
    const foreignTag = await insertTag({ userId: foreignId, name: 'foreign' });
    const { data: plan } = await admin.rpc('create_plan_command_v1', planArgs(ownTag.id)).single();

    const { error } = await admin
      .from('plans')
      .update({ tag_id: foreignTag.id })
      .eq('id', plan!.id);

    expect(error).not.toBeNull();
  });
});

// TODO（着火後）: 三状態部分更新 × 無効なタグ。
// apply_mcp_plan_update_v1 / apply_mcp_record_update_v1 を
//   p_tag_id_present: true + アーカイブ済み tag
// で呼び、DT014 が出ることを固定する。現在この組み合わせだけカバレッジが無い
// （既存の三状態テストは「有効なタグ / 明示 null」の 2 経路しか通らない）。
// MCP 認可の足場（connection / access token / receipt）が要るため、
// mcp-plan-mutations-apply.integration.test.ts の beforeAll を流用する。
