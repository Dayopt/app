// 共通型定義（Edge Function 用）
// 各 Function 内のインライン型をここに集約

// ============================================================
// daily-insights
// ============================================================

export interface ActiveUser {
  user_id: string;
  entry_count: number;
}

export interface DailySnapshot {
  day: string;
  total_minutes: number;
  avg_fulfillment: number | null;
}

// ============================================================
// send-auth-email
// ============================================================

export interface EmailData {
  token: string;
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
  site_url: string;
  token_new: string;
  token_hash_new: string;
}

export interface WebhookPayload {
  user: {
    id: string;
    email: string;
    user_metadata: {
      full_name?: string;
    };
  };
  email_data: EmailData;
}
