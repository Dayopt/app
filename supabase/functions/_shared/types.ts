// 共通型定義（Edge Function 用）
// 各 Function 内のインライン型をここに集約

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
    /** email_change フローで設定される変更先アドレス */
    new_email?: string;
    user_metadata: {
      full_name?: string;
    };
  };
  email_data: EmailData;
}
