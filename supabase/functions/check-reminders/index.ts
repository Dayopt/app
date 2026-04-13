// check-reminders Edge Function
// リマインダーカラム削除に伴い無効化 (20260414100000_drop_unused_entry_columns)

import { verifyCronSecret } from '../_shared/auth-guard.ts';
import { corsResponse, jsonResponse } from '../_shared/response.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsResponse();
  }

  const authError = verifyCronSecret(req);
  if (authError) return authError;

  return jsonResponse({ message: 'Reminders disabled', count: 0 });
});
