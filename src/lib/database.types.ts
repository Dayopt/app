export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.1';
  };
  public: {
    Tables: {
      email_suppressions: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          reason: string;
          source_event_id: string | null;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          reason: string;
          source_event_id?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          reason?: string;
          source_event_id?: string | null;
        };
        Relationships: [];
      };
      entries: {
        Row: {
          actual_end_time: string | null;
          actual_start_time: string | null;
          created_at: string | null;
          deleted_at: string | null;
          description: string | null;
          duration_minutes: number | null;
          end_time: string | null;
          fulfillment_score: number | null;
          id: string;
          origin: string;
          start_time: string | null;
          tag_id: string | null;
          title: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          actual_end_time?: string | null;
          actual_start_time?: string | null;
          created_at?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          duration_minutes?: number | null;
          end_time?: string | null;
          fulfillment_score?: number | null;
          id?: string;
          origin?: string;
          start_time?: string | null;
          tag_id?: string | null;
          title: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          actual_end_time?: string | null;
          actual_start_time?: string | null;
          created_at?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          duration_minutes?: number | null;
          end_time?: string | null;
          fulfillment_score?: number | null;
          id?: string;
          origin?: string;
          start_time?: string | null;
          tag_id?: string | null;
          title?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'entries_tag_id_fkey';
            columns: ['tag_id'];
            isOneToOne: false;
            referencedRelation: 'tags';
            referencedColumns: ['id'];
          },
        ];
      };
      mfa_recovery_codes: {
        Row: {
          code_hash: string;
          created_at: string;
          id: string;
          used_at: string | null;
          user_id: string;
        };
        Insert: {
          code_hash: string;
          created_at?: string;
          id?: string;
          used_at?: string | null;
          user_id: string;
        };
        Update: {
          code_hash?: string;
          created_at?: string;
          id?: string;
          used_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          created_at: string;
          data: Json | null;
          entry_id: string | null;
          fire_at: string | null;
          id: string;
          read_at: string | null;
          title: string;
          type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          data?: Json | null;
          entry_id?: string | null;
          fire_at?: string | null;
          id?: string;
          read_at?: string | null;
          title: string;
          type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          data?: Json | null;
          entry_id?: string | null;
          fire_at?: string | null;
          id?: string;
          read_at?: string | null;
          title?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_related_plan_id_fkey';
            columns: ['entry_id'];
            isOneToOne: false;
            referencedRelation: 'entries';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string;
          full_name: string | null;
          id: string;
          onboarding_completed_at: string | null;
          stripe_customer_id: string | null;
          subscription_id: string | null;
          subscription_status: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email: string;
          full_name?: string | null;
          id: string;
          onboarding_completed_at?: string | null;
          stripe_customer_id?: string | null;
          subscription_id?: string | null;
          subscription_status?: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string;
          full_name?: string | null;
          id?: string;
          onboarding_completed_at?: string | null;
          stripe_customer_id?: string | null;
          subscription_id?: string | null;
          subscription_status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          content: Json;
          created_at: string;
          id: string;
          period_end: string;
          period_start: string;
          period_type: string;
          summary: string;
          user_id: string;
        };
        Insert: {
          content: Json;
          created_at?: string;
          id?: string;
          period_end: string;
          period_start: string;
          period_type: string;
          summary: string;
          user_id: string;
        };
        Update: {
          content?: Json;
          created_at?: string;
          id?: string;
          period_end?: string;
          period_start?: string;
          period_type?: string;
          summary?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      stripe_webhook_events: {
        Row: {
          event_id: string;
          event_type: string;
          id: string;
          processed_at: string;
        };
        Insert: {
          event_id: string;
          event_type: string;
          id?: string;
          processed_at?: string;
        };
        Update: {
          event_id?: string;
          event_type?: string;
          id?: string;
          processed_at?: string;
        };
        Relationships: [];
      };
      tags: {
        Row: {
          color: string | null;
          created_at: string | null;
          icon: string | null;
          id: string;
          is_active: boolean;
          name: string;
          sort_order: number;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          sort_order?: number;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          sort_order?: number;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      user_badges: {
        Row: {
          badge_id: string;
          created_at: string;
          earned_at: string;
          id: string;
          rank: string | null;
          user_id: string;
        };
        Insert: {
          badge_id: string;
          created_at?: string;
          earned_at?: string;
          id?: string;
          rank?: string | null;
          user_id: string;
        };
        Update: {
          badge_id?: string;
          created_at?: string;
          earned_at?: string;
          id?: string;
          rank?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          chronotype_settings: Json | null;
          created_at: string;
          default_duration: number;
          default_view: string;
          hour_height_density: string;
          id: string;
          personalization: Json | null;
          preferred_locale: string;
          show_week_numbers: boolean;
          show_weekends: boolean;
          snap_interval: number;
          theme: string;
          time_format: string;
          timezone: string;
          updated_at: string;
          user_id: string;
          week_starts_on: number;
        };
        Insert: {
          chronotype_settings?: Json | null;
          created_at?: string;
          default_duration?: number;
          default_view?: string;
          hour_height_density?: string;
          id?: string;
          personalization?: Json | null;
          preferred_locale?: string;
          show_week_numbers?: boolean;
          show_weekends?: boolean;
          snap_interval?: number;
          theme?: string;
          time_format?: string;
          timezone?: string;
          updated_at?: string;
          user_id: string;
          week_starts_on?: number;
        };
        Update: {
          chronotype_settings?: Json | null;
          created_at?: string;
          default_duration?: number;
          default_view?: string;
          hour_height_density?: string;
          id?: string;
          personalization?: Json | null;
          preferred_locale?: string;
          show_week_numbers?: boolean;
          show_weekends?: boolean;
          snap_interval?: number;
          theme?: string;
          time_format?: string;
          timezone?: string;
          updated_at?: string;
          user_id?: string;
          week_starts_on?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      auto_shrink_neighbors: {
        Args: {
          p_actual_end: string;
          p_actual_start: string;
          p_entry_id: string;
          p_user_id: string;
        };
        Returns: {
          actual_end_time: string | null;
          actual_start_time: string | null;
          created_at: string | null;
          deleted_at: string | null;
          description: string | null;
          duration_minutes: number | null;
          end_time: string | null;
          fulfillment_score: number | null;
          id: string;
          origin: string;
          start_time: string | null;
          tag_id: string | null;
          title: string;
          updated_at: string | null;
          user_id: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'entries';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      batch_rename_tags: {
        Args: { p_new_names: string[]; p_tag_ids: string[]; p_user_id: string };
        Returns: number;
      };
      batch_reorder_tags: {
        Args: {
          p_sort_orders: number[];
          p_tag_ids: string[];
          p_user_id: string;
        };
        Returns: number;
      };
      bulk_soft_delete_entries: {
        Args: { p_entry_ids: string[]; p_user_id: string };
        Returns: number;
      };
      count_unused_recovery_codes: {
        Args: { p_user_id: string };
        Returns: number;
      };
      custom_access_token_hook: { Args: { event: Json }; Returns: Json };
      delete_old_notifications: { Args: never; Returns: undefined };
      get_active_dates: {
        Args: { p_end_date?: string; p_start_date?: string; p_user_id: string };
        Returns: string[];
      };
      get_active_users_for_daily_insights: {
        Args: { p_date?: string; p_limit?: number };
        Returns: {
          entry_count: number;
          user_id: string;
        }[];
      };
      get_active_users_for_reflection: {
        Args: {
          p_limit?: number;
          p_threshold_days?: number;
          p_week_start: string;
        };
        Returns: {
          entry_count: number;
          user_id: string;
        }[];
      };
      get_avg_fulfillment: {
        Args: { p_end_date?: string; p_start_date?: string; p_user_id: string };
        Returns: Json;
      };
      get_blank_rate: {
        Args: {
          p_end_date?: string;
          p_sleep_hour?: number;
          p_start_date?: string;
          p_user_id: string;
          p_wake_hour?: number;
        };
        Returns: Json;
      };
      get_child_tag_breakdown: {
        Args: {
          p_end_date?: string;
          p_prefix: string;
          p_start_date?: string;
          p_user_id: string;
        };
        Returns: {
          hours: number;
          tag_color: string;
          tag_id: string;
          tag_name: string;
        }[];
      };
      get_context_switches: {
        Args: { p_end_date?: string; p_start_date?: string; p_user_id: string };
        Returns: Json;
      };
      get_cumulative_time: {
        Args: { p_end_date?: string; p_start_date?: string; p_user_id: string };
        Returns: Json;
      };
      get_daily_hours: {
        Args: { p_user_id: string; p_year: number };
        Returns: {
          day: string;
          hours: number;
        }[];
      };
      get_daily_snapshots: {
        Args: { p_days?: number; p_user_id: string };
        Returns: {
          avg_fulfillment: number;
          day: string;
          total_minutes: number;
        }[];
      };
      get_dow_distribution: {
        Args: { p_end_date?: string; p_start_date?: string; p_user_id: string };
        Returns: {
          dow: number;
          total_minutes: number;
        }[];
      };
      get_energy_map: {
        Args: { p_end: string; p_start: string; p_user_id: string };
        Returns: {
          dow: number;
          hour: number;
          total_minutes: number;
        }[];
      };
      get_estimation_accuracy: {
        Args: { p_end_date?: string; p_start_date?: string; p_user_id: string };
        Returns: {
          avg_actual_minutes: number;
          avg_deviation_minutes: number;
          avg_planned_minutes: number;
          entry_count: number;
          tag_color: string;
          tag_id: string;
          tag_name: string;
        }[];
      };
      get_fulfillment_trend: {
        Args: { p_end: string; p_start: string; p_user_id: string };
        Returns: {
          avg_fulfillment: number;
          day: string;
        }[];
      };
      get_hourly_distribution: {
        Args: { p_end_date?: string; p_start_date?: string; p_user_id: string };
        Returns: {
          hour: number;
          total_minutes: number;
        }[];
      };
      get_monthly_hours: {
        Args: { p_months?: number; p_user_id: string };
        Returns: {
          hours: number;
          month: string;
        }[];
      };
      get_plan_rate: {
        Args: { p_end_date?: string; p_start_date?: string; p_user_id: string };
        Returns: Json;
      };
      get_plan_summary: { Args: { p_user_id: string }; Returns: Json };
      get_stats_kpi_summary: {
        Args: {
          p_end_date?: string;
          p_sleep_hour?: number;
          p_start_date?: string;
          p_user_id: string;
          p_wake_hour?: number;
        };
        Returns: Json;
      };
      get_stats_page_data: {
        Args: {
          p_end_date: string;
          p_monthly_months?: number;
          p_prev_end: string;
          p_prev_start: string;
          p_sleep_hour?: number;
          p_start_date: string;
          p_user_id: string;
          p_wake_hour?: number;
          p_year: number;
        };
        Returns: Json;
      };
      get_tag_accuracy_trend: {
        Args: {
          p_bucket?: string;
          p_end_date?: string;
          p_start_date?: string;
          p_tag_id: string;
          p_user_id: string;
        };
        Returns: {
          avg_deviation: number;
          bucket: string;
          entry_count: number;
        }[];
      };
      get_tag_avg_fulfillment: {
        Args: {
          p_end_date?: string;
          p_start_date?: string;
          p_tag_id: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      get_tag_cumulative_time: {
        Args: {
          p_end_date?: string;
          p_start_date?: string;
          p_tag_id: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      get_tag_dow_distribution: {
        Args: {
          p_end_date?: string;
          p_start_date?: string;
          p_tag_id: string;
          p_user_id: string;
        };
        Returns: {
          dow: number;
          total_minutes: number;
        }[];
      };
      get_tag_fulfillment_distribution: {
        Args: {
          p_end_date?: string;
          p_start_date?: string;
          p_tag_id: string;
          p_user_id: string;
        };
        Returns: {
          count: number;
          score: number;
        }[];
      };
      get_tag_hourly_distribution: {
        Args: {
          p_end_date?: string;
          p_start_date?: string;
          p_tag_id: string;
          p_user_id: string;
        };
        Returns: {
          hour: number;
          total_minutes: number;
        }[];
      };
      get_tag_plan_rate: {
        Args: {
          p_end_date?: string;
          p_start_date?: string;
          p_tag_id: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      get_tag_recent_entries: {
        Args: { p_limit?: number; p_tag_id: string; p_user_id: string };
        Returns: {
          duration_minutes: number;
          end_time: string;
          entry_id: string;
          fulfillment_score: number;
          planned_minutes: number;
          start_time: string;
          title: string;
        }[];
      };
      get_tag_stats: {
        Args: { p_user_id: string };
        Returns: {
          entry_count: number;
          last_used: string;
          tag_id: string;
        }[];
      };
      get_time_by_tag: {
        Args: { p_end_date?: string; p_start_date?: string; p_user_id: string };
        Returns: {
          hours: number;
          tag_color: string;
          tag_id: string;
          tag_name: string;
        }[];
      };
      get_time_pl_data: {
        Args: {
          p_end_date: string;
          p_prev_end?: string;
          p_prev_start?: string;
          p_sleep_hour?: number;
          p_start_date: string;
          p_user_id: string;
          p_wake_hour?: number;
        };
        Returns: Json;
      };
      get_timeboxing_adherence: {
        Args: { p_end: string; p_start: string; p_user_id: string };
        Returns: Json;
      };
      get_total_time: { Args: { p_user_id: string }; Returns: Json };
      get_user_timezone: { Args: { p_user_id: string }; Returns: string };
      get_vault_secret: { Args: { p_name: string }; Returns: string };
      get_weekly_focus_score: {
        Args: { p_user_id: string; p_weeks?: number };
        Returns: {
          entry_count: number;
          focus_score: number;
          unique_tags: number;
          week_start: string;
        }[];
      };
      increment_tag_sort_orders: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      invoke_edge_function: {
        Args: { p_body?: Json; p_function_name: string };
        Returns: number;
      };
      merge_tags:
        | {
            Args: {
              p_source_tag_id: string;
              p_target_tag_id: string;
              p_user_id: string;
            };
            Returns: Json;
          }
        | {
            Args: {
              p_source_tag_ids: string[];
              p_target_tag_id: string;
              p_user_id: string;
            };
            Returns: Json;
          };
      rename_tag_group: {
        Args: { p_new_prefix: string; p_old_prefix: string; p_user_id: string };
        Returns: {
          color: string | null;
          created_at: string | null;
          icon: string | null;
          id: string;
          is_active: boolean;
          name: string;
          sort_order: number;
          updated_at: string | null;
          user_id: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'tags';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      restore_entry: {
        Args: { p_entry_id: string; p_user_id: string };
        Returns: undefined;
      };
      soft_delete_entry: {
        Args: { p_entry_id: string; p_user_id: string };
        Returns: undefined;
      };
      use_recovery_code: {
        Args: { p_code_hash: string; p_user_id: string };
        Returns: boolean;
      };
      vault_secret_exists: { Args: { p_name: string }; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
