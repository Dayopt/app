// 共通型定義（Edge Function 用）
// 各 Function 内のインライン型をここに集約

// ============================================================
// check-reminders
// ============================================================

export interface ReminderEntry {
  id: string;
  user_id: string;
  title: string;
  start_time: string;
  reminder_at: string | null;
  reminder_sent: boolean;
}

// ============================================================
// generate-reflections
// ============================================================

export interface UserEntry {
  user_id: string;
  entry_count: number;
}

export interface ReflectionResult {
  userId: string;
  status: 'generated' | 'skipped' | 'error';
  reflectionId?: string;
  error?: string;
}

export interface EntryRow {
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  fulfillment_score: number | null;
}

export interface AnomalyAlert {
  type: 'fulfillment_drop' | 'time_surge' | 'no_record_streak';
  severity: 'warning' | 'critical';
  message: string;
  baseline?: number;
  current?: number;
  streakDays?: number;
}

export interface WeeklyReflectionData {
  total_entries: number;
  total_minutes: number;
  avg_fulfillment: number;
}

export interface ParsedReflection {
  title: string;
  insights: string;
  question: string;
  activities: Array<{ label: string; minutes: number; highlight: string }>;
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
    email: string;
    user_metadata: {
      full_name?: string;
    };
  };
  email_data: EmailData;
}
