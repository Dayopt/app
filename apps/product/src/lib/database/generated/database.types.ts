export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.1';
  };
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
      external_calendar_events: {
        Row: {
          calendar_name: string | null;
          created_at: string;
          description: string | null;
          dismissed_at: string | null;
          end_at: string | null;
          id: string;
          last_synced_at: string;
          provider: string;
          provider_calendar_id: string;
          provider_event_id: string;
          start_at: string | null;
          status: string;
          title: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          calendar_name?: string | null;
          created_at?: string;
          description?: string | null;
          dismissed_at?: string | null;
          end_at?: string | null;
          id?: string;
          last_synced_at: string;
          provider: string;
          provider_calendar_id: string;
          provider_event_id: string;
          start_at?: string | null;
          status: string;
          title?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          calendar_name?: string | null;
          created_at?: string;
          description?: string | null;
          dismissed_at?: string | null;
          end_at?: string | null;
          id?: string;
          last_synced_at?: string;
          provider?: string;
          provider_calendar_id?: string;
          provider_event_id?: string;
          start_at?: string | null;
          status?: string;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
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
      oauth_audit_log: {
        Row: {
          called_at: string;
          client_id: string;
          id: string;
          token_id: string | null;
          tool_name: string;
          user_id: string;
        };
        Insert: {
          called_at?: string;
          client_id: string;
          id?: string;
          token_id?: string | null;
          tool_name: string;
          user_id: string;
        };
        Update: {
          called_at?: string;
          client_id?: string;
          id?: string;
          token_id?: string | null;
          tool_name?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'oauth_audit_log_token_id_fkey';
            columns: ['token_id'];
            isOneToOne: false;
            referencedRelation: 'oauth_tokens';
            referencedColumns: ['id'];
          },
        ];
      };
      oauth_authorization_codes: {
        Row: {
          client_id: string;
          code_challenge: string;
          code_challenge_method: string;
          code_hash: string;
          consumed_at: string | null;
          created_at: string;
          expires_at: string;
          redirect_uri: string;
          scopes: string[];
          user_id: string;
        };
        Insert: {
          client_id: string;
          code_challenge: string;
          code_challenge_method: string;
          code_hash: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          redirect_uri: string;
          scopes: string[];
          user_id: string;
        };
        Update: {
          client_id?: string;
          code_challenge?: string;
          code_challenge_method?: string;
          code_hash?: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          redirect_uri?: string;
          scopes?: string[];
          user_id?: string;
        };
        Relationships: [];
      };
      oauth_tokens: {
        Row: {
          client_id: string;
          created_at: string;
          expires_at: string;
          id: string;
          last_used_at: string | null;
          parent_token_id: string | null;
          revoked_at: string | null;
          scopes: string[];
          token_hash: string;
          token_type: string;
          user_id: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          last_used_at?: string | null;
          parent_token_id?: string | null;
          revoked_at?: string | null;
          scopes?: string[];
          token_hash: string;
          token_type: string;
          user_id: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          last_used_at?: string | null;
          parent_token_id?: string | null;
          revoked_at?: string | null;
          scopes?: string[];
          token_hash?: string;
          token_type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'oauth_tokens_parent_token_id_fkey';
            columns: ['parent_token_id'];
            isOneToOne: false;
            referencedRelation: 'oauth_tokens';
            referencedColumns: ['id'];
          },
        ];
      };
      plans: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          end_at: string;
          external_calendar_event_id: string | null;
          id: string;
          note: string | null;
          skipped_at: string | null;
          source: string;
          start_at: string;
          tag_id: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          end_at: string;
          external_calendar_event_id?: string | null;
          id?: string;
          note?: string | null;
          skipped_at?: string | null;
          source?: string;
          start_at: string;
          tag_id?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          end_at?: string;
          external_calendar_event_id?: string | null;
          id?: string;
          note?: string | null;
          skipped_at?: string | null;
          source?: string;
          start_at?: string;
          tag_id?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'plans_external_calendar_event_id_fkey';
            columns: ['external_calendar_event_id'];
            isOneToOne: false;
            referencedRelation: 'external_calendar_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plans_tag_id_fkey';
            columns: ['tag_id'];
            isOneToOne: false;
            referencedRelation: 'tags';
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
          stripe_customer_id?: string | null;
          subscription_id?: string | null;
          subscription_status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      records: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          end_at: string;
          external_calendar_event_id: string | null;
          id: string;
          note: string | null;
          plan_id: string | null;
          source: string;
          start_at: string;
          tag_id: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          end_at: string;
          external_calendar_event_id?: string | null;
          id?: string;
          note?: string | null;
          plan_id?: string | null;
          source?: string;
          start_at: string;
          tag_id?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          end_at?: string;
          external_calendar_event_id?: string | null;
          id?: string;
          note?: string | null;
          plan_id?: string | null;
          source?: string;
          start_at?: string;
          tag_id?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'records_external_calendar_event_id_fkey';
            columns: ['external_calendar_event_id'];
            isOneToOne: false;
            referencedRelation: 'external_calendar_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'records_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'records_tag_id_fkey';
            columns: ['tag_id'];
            isOneToOne: false;
            referencedRelation: 'tags';
            referencedColumns: ['id'];
          },
        ];
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
          claimed_at: string;
          event_id: string;
          event_type: string;
          id: string;
          processed_at: string | null;
          status: 'processing' | 'processed' | 'failed';
        };
        Insert: {
          claimed_at?: string;
          event_id: string;
          event_type: string;
          id?: string;
          processed_at?: string | null;
          status?: 'processing' | 'processed' | 'failed';
        };
        Update: {
          claimed_at?: string;
          event_id?: string;
          event_type?: string;
          id?: string;
          processed_at?: string | null;
          status?: 'processing' | 'processed' | 'failed';
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
          parent_id: string | null;
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
          parent_id?: string | null;
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
          parent_id?: string | null;
          sort_order?: number;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tags_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'tags';
            referencedColumns: ['id'];
          },
        ];
      };
      user_settings: {
        Row: {
          created_at: string;
          default_duration: number;
          default_view: string;
          hour_height_density: string;
          ical_feed_token: string | null;
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
          created_at?: string;
          default_duration?: number;
          default_view?: string;
          hour_height_density?: string;
          ical_feed_token?: string | null;
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
          created_at?: string;
          default_duration?: number;
          default_view?: string;
          hour_height_density?: string;
          ical_feed_token?: string | null;
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
      claim_stripe_webhook_event: {
        Args: {
          p_event_id: string;
          p_event_type: string;
          p_stale_before: string;
        };
        Returns: string;
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
      batch_reorder_tags_hierarchy: {
        Args: {
          p_parent_ids: string[];
          p_sort_orders: number[];
          p_tag_ids: string[];
          p_user_id: string;
        };
        Returns: number;
      };
      confirm_day_plans_to_records: {
        Args: {
          p_confirmed_at?: string;
          p_end_at: string;
          p_start_at: string;
          p_user_id: string;
        };
        Returns: {
          created_at: string;
          deleted_at: string | null;
          end_at: string;
          external_calendar_event_id: string | null;
          id: string;
          note: string | null;
          plan_id: string | null;
          source: string;
          start_at: string;
          tag_id: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'records';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      count_unused_recovery_codes: {
        Args: { p_user_id: string };
        Returns: number;
      };
      custom_access_token_hook: { Args: { event: Json }; Returns: Json };
      get_user_timezone: { Args: { p_user_id: string }; Returns: string };
      get_vault_secret: { Args: { p_name: string }; Returns: string };
      increment_tag_sort_orders: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      invoke_edge_function: {
        Args: { p_body?: Json; p_function_name: string };
        Returns: number;
      };
      issue_oauth_token_pair: {
        Args: {
          p_access_expires_at: string;
          p_access_hash: string;
          p_client_id: string;
          p_parent_refresh_id?: string;
          p_refresh_expires_at: string;
          p_refresh_hash: string;
          p_scopes: string[];
          p_user_id: string;
        };
        Returns: {
          access_id: string;
          refresh_id: string;
        }[];
      };
      merge_tags_with_hierarchy: {
        Args: {
          p_source_tag_id: string;
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
          parent_id: string | null;
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
      restore_plan: {
        Args: { p_plan_id: string; p_user_id: string };
        Returns: undefined;
      };
      restore_record: {
        Args: { p_record_id: string; p_user_id: string };
        Returns: undefined;
      };
      soft_delete_plan: {
        Args: { p_plan_id: string; p_user_id: string };
        Returns: undefined;
      };
      soft_delete_record: {
        Args: { p_record_id: string; p_user_id: string };
        Returns: undefined;
      };
      trunc_week_tz: {
        Args: { ts: string; tz: string; week_start?: number };
        Returns: string;
      };
      update_personalization: {
        Args: { p_path: string; p_user_id: string; p_value: Json };
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
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
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
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
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
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
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
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
  public: {
    Enums: {},
  },
} as const;
