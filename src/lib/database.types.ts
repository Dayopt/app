export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  pgbouncer: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_auth: {
        Args: { p_usename: string };
        Returns: {
          password: string;
          username: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      _backup_record_activities: {
        Row: {
          action_type: string | null;
          created_at: string | null;
          field_name: string | null;
          id: string | null;
          metadata: Json | null;
          new_value: string | null;
          old_value: string | null;
          record_id: string | null;
          schema_version: number | null;
          user_id: string | null;
        };
        Insert: {
          action_type?: string | null;
          created_at?: string | null;
          field_name?: string | null;
          id?: string | null;
          metadata?: Json | null;
          new_value?: string | null;
          old_value?: string | null;
          record_id?: string | null;
          schema_version?: number | null;
          user_id?: string | null;
        };
        Update: {
          action_type?: string | null;
          created_at?: string | null;
          field_name?: string | null;
          id?: string | null;
          metadata?: Json | null;
          new_value?: string | null;
          old_value?: string | null;
          record_id?: string | null;
          schema_version?: number | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      _backup_record_tags: {
        Row: {
          created_at: string | null;
          id: string | null;
          record_id: string | null;
          tag_id: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string | null;
          record_id?: string | null;
          tag_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string | null;
          record_id?: string | null;
          tag_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      _backup_records: {
        Row: {
          created_at: string | null;
          description: string | null;
          duration_minutes: number | null;
          end_time: string | null;
          fulfillment_score: number | null;
          id: string | null;
          plan_id: string | null;
          start_time: string | null;
          title: string | null;
          updated_at: string | null;
          user_id: string | null;
          worked_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          duration_minutes?: number | null;
          end_time?: string | null;
          fulfillment_score?: number | null;
          id?: string | null;
          plan_id?: string | null;
          start_time?: string | null;
          title?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
          worked_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          duration_minutes?: number | null;
          end_time?: string | null;
          fulfillment_score?: number | null;
          id?: string | null;
          plan_id?: string | null;
          start_time?: string | null;
          title?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
          worked_at?: string | null;
        };
        Relationships: [];
      };
      ai_usage: {
        Row: {
          created_at: string;
          id: string;
          month: string;
          request_count: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          month: string;
          request_count?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          month?: string;
          request_count?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      auth_audit_logs: {
        Row: {
          created_at: string;
          event_type: string;
          geo_city: string | null;
          geo_country: string | null;
          id: string;
          ip_address: string | null;
          metadata: Json | null;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          geo_city?: string | null;
          geo_country?: string | null;
          id?: string;
          ip_address?: string | null;
          metadata?: Json | null;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          geo_city?: string | null;
          geo_country?: string | null;
          id?: string;
          ip_address?: string | null;
          metadata?: Json | null;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      chat_conversations: {
        Row: {
          created_at: string;
          id: string;
          message_count: number;
          messages: Json;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message_count?: number;
          messages?: Json;
          title?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message_count?: number;
          messages?: Json;
          title?: string;
          updated_at?: string;
          user_id?: string;
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
          recurrence_end_date: string | null;
          recurrence_rule: string | null;
          recurrence_type: string | null;
          reminder_at: string | null;
          reminder_minutes: number | null;
          reminder_sent: boolean;
          reviewed_at: string | null;
          start_time: string | null;
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
          recurrence_end_date?: string | null;
          recurrence_rule?: string | null;
          recurrence_type?: string | null;
          reminder_at?: string | null;
          reminder_minutes?: number | null;
          reminder_sent?: boolean;
          reviewed_at?: string | null;
          start_time?: string | null;
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
          recurrence_end_date?: string | null;
          recurrence_rule?: string | null;
          recurrence_type?: string | null;
          reminder_at?: string | null;
          reminder_minutes?: number | null;
          reminder_sent?: boolean;
          reviewed_at?: string | null;
          start_time?: string | null;
          title?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      entry_activities: {
        Row: {
          action_type: string;
          created_at: string;
          entry_id: string | null;
          field_name: string | null;
          id: string;
          metadata: Json | null;
          new_value: string | null;
          old_value: string | null;
          schema_version: number;
          user_id: string;
        };
        Insert: {
          action_type: string;
          created_at?: string;
          entry_id?: string | null;
          field_name?: string | null;
          id?: string;
          metadata?: Json | null;
          new_value?: string | null;
          old_value?: string | null;
          schema_version?: number;
          user_id: string;
        };
        Update: {
          action_type?: string;
          created_at?: string;
          entry_id?: string | null;
          field_name?: string | null;
          id?: string;
          metadata?: Json | null;
          new_value?: string | null;
          old_value?: string | null;
          schema_version?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'plan_activities_plan_id_fkey';
            columns: ['entry_id'];
            referencedRelation: 'entries';
            referencedColumns: ['id'];
          },
        ];
      };
      entry_instances: {
        Row: {
          created_at: string;
          description: string | null;
          entry_id: string;
          exception_type: string | null;
          id: string;
          instance_date: string;
          instance_end: string | null;
          instance_start: string | null;
          original_date: string | null;
          title: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          entry_id: string;
          exception_type?: string | null;
          id?: string;
          instance_date: string;
          instance_end?: string | null;
          instance_start?: string | null;
          original_date?: string | null;
          title?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          entry_id?: string;
          exception_type?: string | null;
          id?: string;
          instance_date?: string;
          instance_end?: string | null;
          instance_start?: string | null;
          original_date?: string | null;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'plan_instances_plan_id_fkey';
            columns: ['entry_id'];
            referencedRelation: 'entries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entry_instances_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      entry_tags: {
        Row: {
          created_at: string | null;
          entry_id: string;
          id: string;
          tag_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          entry_id: string;
          id?: string;
          tag_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          entry_id?: string;
          id?: string;
          tag_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'plan_tags_plan_id_fkey';
            columns: ['entry_id'];
            referencedRelation: 'entries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_tags_tag_id_fkey';
            columns: ['tag_id'];
            referencedRelation: 'tags';
            referencedColumns: ['id'];
          },
        ];
      };
      login_attempts: {
        Row: {
          attempt_time: string;
          created_at: string;
          email: string;
          id: string;
          ip_address: string | null;
          is_successful: boolean;
          user_agent: string | null;
        };
        Insert: {
          attempt_time?: string;
          created_at?: string;
          email: string;
          id?: string;
          ip_address?: string | null;
          is_successful?: boolean;
          user_agent?: string | null;
        };
        Update: {
          attempt_time?: string;
          created_at?: string;
          email?: string;
          id?: string;
          ip_address?: string | null;
          is_successful?: boolean;
          user_agent?: string | null;
        };
        Relationships: [];
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
      notification_preferences: {
        Row: {
          created_at: string;
          default_reminder_minutes: number | null;
          enable_browser_notifications: boolean;
          enable_email_notifications: boolean;
          enable_push_notifications: boolean;
          id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          default_reminder_minutes?: number | null;
          enable_browser_notifications?: boolean;
          enable_email_notifications?: boolean;
          enable_push_notifications?: boolean;
          id?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          default_reminder_minutes?: number | null;
          enable_browser_notifications?: boolean;
          enable_email_notifications?: boolean;
          enable_push_notifications?: boolean;
          id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          created_at: string;
          data: Json | null;
          entry_id: string | null;
          id: string;
          is_read: boolean;
          read_at: string | null;
          reflection_id: string | null;
          type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          data?: Json | null;
          entry_id?: string | null;
          id?: string;
          is_read?: boolean;
          read_at?: string | null;
          reflection_id?: string | null;
          type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          data?: Json | null;
          entry_id?: string | null;
          id?: string;
          is_read?: boolean;
          read_at?: string | null;
          reflection_id?: string | null;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_reflection_id_fkey';
            columns: ['reflection_id'];
            referencedRelation: 'reflections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_related_plan_id_fkey';
            columns: ['entry_id'];
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
          updated_at: string;
          username: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email: string;
          full_name?: string | null;
          id: string;
          onboarding_completed_at?: string | null;
          updated_at?: string;
          username?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string;
          full_name?: string | null;
          id?: string;
          onboarding_completed_at?: string | null;
          updated_at?: string;
          username?: string | null;
        };
        Relationships: [];
      };
      reflections: {
        Row: {
          activities: Json;
          completion_tokens: number | null;
          created_at: string;
          id: string;
          insights: string;
          model_used: string | null;
          period_end: string;
          period_start: string;
          period_type: string;
          prompt_tokens: number | null;
          question: string;
          title: string;
          updated_at: string;
          user_id: string;
          user_note: string;
        };
        Insert: {
          activities?: Json;
          completion_tokens?: number | null;
          created_at?: string;
          id?: string;
          insights?: string;
          model_used?: string | null;
          period_end: string;
          period_start: string;
          period_type: string;
          prompt_tokens?: number | null;
          question?: string;
          title: string;
          updated_at?: string;
          user_id: string;
          user_note?: string;
        };
        Update: {
          activities?: Json;
          completion_tokens?: number | null;
          created_at?: string;
          id?: string;
          insights?: string;
          model_used?: string | null;
          period_end?: string;
          period_start?: string;
          period_type?: string;
          prompt_tokens?: number | null;
          question?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
          user_note?: string;
        };
        Relationships: [];
      };
      tags: {
        Row: {
          color: string | null;
          created_at: string | null;
          description: string | null;
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
          description?: string | null;
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
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          sort_order?: number;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          ai_communication_style: string | null;
          ai_custom_style_prompt: string | null;
          business_hours_end: number;
          business_hours_start: number;
          chronotype_custom_zones: Json | null;
          chronotype_display_mode: string;
          chronotype_enabled: boolean;
          chronotype_opacity: number;
          chronotype_type: string;
          color_scheme: string;
          created_at: string;
          date_format: string;
          default_duration: number;
          id: string;
          personalization_ranked_values: Json | null;
          personalization_values: Json | null;
          plan_record_mode: string;
          show_declined_events: boolean;
          show_utc_offset: boolean;
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
          ai_communication_style?: string | null;
          ai_custom_style_prompt?: string | null;
          business_hours_end?: number;
          business_hours_start?: number;
          chronotype_custom_zones?: Json | null;
          chronotype_display_mode?: string;
          chronotype_enabled?: boolean;
          chronotype_opacity?: number;
          chronotype_type?: string;
          color_scheme?: string;
          created_at?: string;
          date_format?: string;
          default_duration?: number;
          id?: string;
          personalization_ranked_values?: Json | null;
          personalization_values?: Json | null;
          plan_record_mode?: string;
          show_declined_events?: boolean;
          show_utc_offset?: boolean;
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
          ai_communication_style?: string | null;
          ai_custom_style_prompt?: string | null;
          business_hours_end?: number;
          business_hours_start?: number;
          chronotype_custom_zones?: Json | null;
          chronotype_display_mode?: string;
          chronotype_enabled?: boolean;
          chronotype_opacity?: number;
          chronotype_type?: string;
          color_scheme?: string;
          created_at?: string;
          date_format?: string;
          default_duration?: number;
          id?: string;
          personalization_ranked_values?: Json | null;
          personalization_values?: Json | null;
          plan_record_mode?: string;
          show_declined_events?: boolean;
          show_utc_offset?: boolean;
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
      cleanup_old_auth_audit_logs: { Args: never; Returns: undefined };
      cleanup_old_login_attempts: { Args: never; Returns: undefined };
      cleanup_old_plan_activities: { Args: never; Returns: undefined };
      count_unused_recovery_codes: {
        Args: { p_user_id: string };
        Returns: number;
      };
      delete_old_notifications: { Args: never; Returns: undefined };
      get_active_dates: {
        Args: { p_since: string; p_user_id: string };
        Returns: {
          active_date: string;
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
      get_blank_rate: {
        Args: {
          p_end_date: string;
          p_sleep_hour?: number;
          p_start_date: string;
          p_user_id: string;
          p_wake_hour?: number;
        };
        Returns: Json;
      };
      get_context_switches: {
        Args: { p_end_date: string; p_start_date: string; p_user_id: string };
        Returns: Json;
      };
      get_daily_hours: {
        Args: { p_end_date: string; p_start_date: string; p_user_id: string };
        Returns: {
          date: string;
          hours: number;
        }[];
      };
      get_dow_distribution: {
        Args: { p_end_date?: string; p_start_date?: string; p_user_id: string };
        Returns: {
          dow: number;
          hours: number;
        }[];
      };
      get_energy_map: {
        Args: { p_end_date: string; p_start_date: string; p_user_id: string };
        Returns: {
          avg_fulfillment: number;
          dow: number;
          entry_count: number;
          hour: number;
          total_minutes: number;
        }[];
      };
      get_estimation_accuracy: {
        Args: { p_end_date: string; p_start_date: string; p_user_id: string };
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
        Args: { p_end_date: string; p_start_date: string; p_user_id: string };
        Returns: {
          avg_score: number;
          count: number;
          date: string;
        }[];
      };
      get_hourly_distribution: {
        Args: { p_end_date?: string; p_start_date?: string; p_user_id: string };
        Returns: {
          hour: number;
          hours: number;
        }[];
      };
      get_monthly_hours: {
        Args: { p_start_date: string; p_user_id: string };
        Returns: {
          hours: number;
          month: string;
        }[];
      };
      get_plan_rate: {
        Args: { p_end_date: string; p_start_date: string; p_user_id: string };
        Returns: Json;
      };
      get_plan_summary: { Args: { p_user_id: string }; Returns: Json };
      get_tag_stats: {
        Args: { p_user_id: string };
        Returns: {
          entry_count: number;
          last_used: string;
          tag_id: string;
        }[];
      };
      get_timeboxing_adherence: {
        Args: { p_end_date: string; p_start_date: string; p_user_id: string };
        Returns: Json;
      };
      get_total_time: { Args: { p_user_id: string }; Returns: Json };
      get_weekly_focus_score: {
        Args: { p_user_id: string; p_weeks?: number };
        Returns: {
          focus_score: number;
          total_minutes: number;
          week_start: string;
        }[];
      };
      get_weekly_reflection_data: {
        Args: { p_user_id: string; p_week_start: string };
        Returns: Json;
      };
      increment_ai_usage: {
        Args: { p_month: string; p_user_id: string };
        Returns: undefined;
      };
      increment_tag_sort_orders: {
        Args: { p_user_id: string };
        Returns: undefined;
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
      record_login_attempt: {
        Args: {
          p_email: string;
          p_ip_address?: string;
          p_is_successful?: boolean;
          p_user_agent?: string;
        };
        Returns: string;
      };
      use_recovery_code: {
        Args: { p_code_hash: string; p_user_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null;
          avif_autodetection: boolean | null;
          created_at: string | null;
          file_size_limit: number | null;
          id: string;
          name: string;
          owner: string | null;
          owner_id: string | null;
          public: boolean | null;
          type: Database['storage']['Enums']['buckettype'];
          updated_at: string | null;
        };
        Insert: {
          allowed_mime_types?: string[] | null;
          avif_autodetection?: boolean | null;
          created_at?: string | null;
          file_size_limit?: number | null;
          id: string;
          name: string;
          owner?: string | null;
          owner_id?: string | null;
          public?: boolean | null;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string | null;
        };
        Update: {
          allowed_mime_types?: string[] | null;
          avif_autodetection?: boolean | null;
          created_at?: string | null;
          file_size_limit?: number | null;
          id?: string;
          name?: string;
          owner?: string | null;
          owner_id?: string | null;
          public?: boolean | null;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string | null;
        };
        Relationships: [];
      };
      buckets_analytics: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          format: string;
          id: string;
          name: string;
          type: Database['storage']['Enums']['buckettype'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          format?: string;
          id?: string;
          name: string;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          format?: string;
          id?: string;
          name?: string;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string;
        };
        Relationships: [];
      };
      buckets_vectors: {
        Row: {
          created_at: string;
          id: string;
          type: Database['storage']['Enums']['buckettype'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string;
        };
        Relationships: [];
      };
      iceberg_namespaces: {
        Row: {
          bucket_name: string;
          catalog_id: string;
          created_at: string;
          id: string;
          metadata: Json;
          name: string;
          updated_at: string;
        };
        Insert: {
          bucket_name: string;
          catalog_id: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          name: string;
          updated_at?: string;
        };
        Update: {
          bucket_name?: string;
          catalog_id?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'iceberg_namespaces_catalog_id_fkey';
            columns: ['catalog_id'];
            referencedRelation: 'buckets_analytics';
            referencedColumns: ['id'];
          },
        ];
      };
      iceberg_tables: {
        Row: {
          bucket_name: string;
          catalog_id: string;
          created_at: string;
          id: string;
          location: string;
          name: string;
          namespace_id: string;
          remote_table_id: string | null;
          shard_id: string | null;
          shard_key: string | null;
          updated_at: string;
        };
        Insert: {
          bucket_name: string;
          catalog_id: string;
          created_at?: string;
          id?: string;
          location: string;
          name: string;
          namespace_id: string;
          remote_table_id?: string | null;
          shard_id?: string | null;
          shard_key?: string | null;
          updated_at?: string;
        };
        Update: {
          bucket_name?: string;
          catalog_id?: string;
          created_at?: string;
          id?: string;
          location?: string;
          name?: string;
          namespace_id?: string;
          remote_table_id?: string | null;
          shard_id?: string | null;
          shard_key?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'iceberg_tables_catalog_id_fkey';
            columns: ['catalog_id'];
            referencedRelation: 'buckets_analytics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'iceberg_tables_namespace_id_fkey';
            columns: ['namespace_id'];
            referencedRelation: 'iceberg_namespaces';
            referencedColumns: ['id'];
          },
        ];
      };
      migrations: {
        Row: {
          executed_at: string | null;
          hash: string;
          id: number;
          name: string;
        };
        Insert: {
          executed_at?: string | null;
          hash: string;
          id: number;
          name: string;
        };
        Update: {
          executed_at?: string | null;
          hash?: string;
          id?: number;
          name?: string;
        };
        Relationships: [];
      };
      objects: {
        Row: {
          bucket_id: string | null;
          created_at: string | null;
          id: string;
          last_accessed_at: string | null;
          metadata: Json | null;
          name: string | null;
          owner: string | null;
          owner_id: string | null;
          path_tokens: string[] | null;
          updated_at: string | null;
          user_metadata: Json | null;
          version: string | null;
        };
        Insert: {
          bucket_id?: string | null;
          created_at?: string | null;
          id?: string;
          last_accessed_at?: string | null;
          metadata?: Json | null;
          name?: string | null;
          owner?: string | null;
          owner_id?: string | null;
          path_tokens?: string[] | null;
          updated_at?: string | null;
          user_metadata?: Json | null;
          version?: string | null;
        };
        Update: {
          bucket_id?: string | null;
          created_at?: string | null;
          id?: string;
          last_accessed_at?: string | null;
          metadata?: Json | null;
          name?: string | null;
          owner?: string | null;
          owner_id?: string | null;
          path_tokens?: string[] | null;
          updated_at?: string | null;
          user_metadata?: Json | null;
          version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'objects_bucketId_fkey';
            columns: ['bucket_id'];
            referencedRelation: 'buckets';
            referencedColumns: ['id'];
          },
        ];
      };
      s3_multipart_uploads: {
        Row: {
          bucket_id: string;
          created_at: string;
          id: string;
          in_progress_size: number;
          key: string;
          owner_id: string | null;
          upload_signature: string;
          user_metadata: Json | null;
          version: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          id: string;
          in_progress_size?: number;
          key: string;
          owner_id?: string | null;
          upload_signature: string;
          user_metadata?: Json | null;
          version: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          id?: string;
          in_progress_size?: number;
          key?: string;
          owner_id?: string | null;
          upload_signature?: string;
          user_metadata?: Json | null;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 's3_multipart_uploads_bucket_id_fkey';
            columns: ['bucket_id'];
            referencedRelation: 'buckets';
            referencedColumns: ['id'];
          },
        ];
      };
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string;
          created_at: string;
          etag: string;
          id: string;
          key: string;
          owner_id: string | null;
          part_number: number;
          size: number;
          upload_id: string;
          version: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          etag: string;
          id?: string;
          key: string;
          owner_id?: string | null;
          part_number: number;
          size?: number;
          upload_id: string;
          version: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          etag?: string;
          id?: string;
          key?: string;
          owner_id?: string | null;
          part_number?: number;
          size?: number;
          upload_id?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 's3_multipart_uploads_parts_bucket_id_fkey';
            columns: ['bucket_id'];
            referencedRelation: 'buckets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 's3_multipart_uploads_parts_upload_id_fkey';
            columns: ['upload_id'];
            referencedRelation: 's3_multipart_uploads';
            referencedColumns: ['id'];
          },
        ];
      };
      vector_indexes: {
        Row: {
          bucket_id: string;
          created_at: string;
          data_type: string;
          dimension: number;
          distance_metric: string;
          id: string;
          metadata_configuration: Json | null;
          name: string;
          updated_at: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          data_type: string;
          dimension: number;
          distance_metric: string;
          id?: string;
          metadata_configuration?: Json | null;
          name: string;
          updated_at?: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          data_type?: string;
          dimension?: number;
          distance_metric?: string;
          id?: string;
          metadata_configuration?: Json | null;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vector_indexes_bucket_id_fkey';
            columns: ['bucket_id'];
            referencedRelation: 'buckets_vectors';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string };
        Returns: undefined;
      };
      extension: { Args: { name: string }; Returns: string };
      filename: { Args: { name: string }; Returns: string };
      foldername: { Args: { name: string }; Returns: string[] };
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string };
        Returns: string;
      };
      get_size_by_bucket: {
        Args: never;
        Returns: {
          bucket_id: string;
          size: number;
        }[];
      };
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string;
          delimiter_param: string;
          max_keys?: number;
          next_key_token?: string;
          next_upload_token?: string;
          prefix_param: string;
        };
        Returns: {
          created_at: string;
          id: string;
          key: string;
        }[];
      };
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string;
          delimiter_param: string;
          max_keys?: number;
          next_token?: string;
          prefix_param: string;
          sort_order?: string;
          start_after?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      operation: { Args: never; Returns: string };
      search: {
        Args: {
          bucketname: string;
          levels?: number;
          limits?: number;
          offsets?: number;
          prefix: string;
          search?: string;
          sortcolumn?: string;
          sortorder?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      search_by_timestamp: {
        Args: {
          p_bucket_id: string;
          p_level: number;
          p_limit: number;
          p_prefix: string;
          p_sort_column: string;
          p_sort_column_after: string;
          p_sort_order: string;
          p_start_after: string;
        };
        Returns: {
          created_at: string;
          id: string;
          key: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      search_v2: {
        Args: {
          bucket_name: string;
          levels?: number;
          limits?: number;
          prefix: string;
          sort_column?: string;
          sort_column_after?: string;
          sort_order?: string;
          start_after?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          key: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
    };
    Enums: {
      buckettype: 'STANDARD' | 'ANALYTICS' | 'VECTOR';
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
  graphql_public: {
    Enums: {},
  },
  pgbouncer: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
  storage: {
    Enums: {
      buckettype: ['STANDARD', 'ANALYTICS', 'VECTOR'],
    },
  },
} as const;
