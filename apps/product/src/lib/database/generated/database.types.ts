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
      calendar_connection_calendars: {
        Row: {
          calendar_name: string | null;
          connection_id: string;
          created_at: string;
          id: string;
          last_synced_at: string | null;
          provider_calendar_id: string;
          sync_token: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          calendar_name?: string | null;
          connection_id: string;
          created_at?: string;
          id?: string;
          last_synced_at?: string | null;
          provider_calendar_id: string;
          sync_token?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          calendar_name?: string | null;
          connection_id?: string;
          created_at?: string;
          id?: string;
          last_synced_at?: string | null;
          provider_calendar_id?: string;
          sync_token?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'calendar_connection_calendars_connection_owner_fkey';
            columns: ['connection_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'calendar_connections';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      calendar_connections: {
        Row: {
          created_at: string;
          data_generation: number;
          granted_scopes: string[];
          id: string;
          last_sync_error: string | null;
          last_synced_at: string | null;
          provider: string;
          provider_account_email: string | null;
          provider_account_id: string;
          refresh_token_enc: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          data_generation?: number;
          granted_scopes: string[];
          id?: string;
          last_sync_error?: string | null;
          last_synced_at?: string | null;
          provider: string;
          provider_account_email?: string | null;
          provider_account_id: string;
          refresh_token_enc: string;
          status: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          data_generation?: number;
          granted_scopes?: string[];
          id?: string;
          last_sync_error?: string | null;
          last_synced_at?: string | null;
          provider?: string;
          provider_account_email?: string | null;
          provider_account_id?: string;
          refresh_token_enc?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
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
          connection_id: string | null;
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
          connection_id?: string | null;
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
          connection_id?: string | null;
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
        Relationships: [
          {
            foreignKeyName: 'external_calendar_events_connection_owner_fkey';
            columns: ['connection_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'calendar_connections';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      mcp_environment_identity: {
        Row: {
          authorization_server_uri: string;
          environment: string;
          provisioned_at: string;
          resource_uri: string;
          singleton_key: boolean;
        };
        Insert: {
          authorization_server_uri: string;
          environment: string;
          provisioned_at?: string;
          resource_uri: string;
          singleton_key?: boolean;
        };
        Update: {
          authorization_server_uri?: string;
          environment?: string;
          provisioned_at?: string;
          resource_uri?: string;
          singleton_key?: boolean;
        };
        Relationships: [];
      };
      mcp_mutation_control: {
        Row: {
          changed_at: string;
          enabled_client_ids: string[];
          revision: number;
          singleton_key: boolean;
          writes_enabled: boolean;
        };
        Insert: {
          changed_at?: string;
          enabled_client_ids?: string[];
          revision?: number;
          singleton_key?: boolean;
          writes_enabled?: boolean;
        };
        Update: {
          changed_at?: string;
          enabled_client_ids?: string[];
          revision?: number;
          singleton_key?: boolean;
          writes_enabled?: boolean;
        };
        Relationships: [];
      };
      mcp_mutation_receipts: {
        Row: {
          applied_at: string;
          client_id: string;
          data_generation: number;
          envelope_version: number;
          operation_id: string;
          origin_connection_id: string | null;
          purged_at: string | null;
          purged_generation: number | null;
          request_digest: string;
          resource_deleted_at: string | null;
          resource_id: string;
          resource_type: string;
          resource_version: string;
          tool_name: string;
          user_id: string;
        };
        Insert: {
          applied_at?: string;
          client_id: string;
          data_generation?: number;
          envelope_version: number;
          operation_id: string;
          origin_connection_id?: string | null;
          purged_at?: string | null;
          purged_generation?: number | null;
          request_digest: string;
          resource_deleted_at?: string | null;
          resource_id: string;
          resource_type: string;
          resource_version: string;
          tool_name: string;
          user_id: string;
        };
        Update: {
          applied_at?: string;
          client_id?: string;
          data_generation?: number;
          envelope_version?: number;
          operation_id?: string;
          origin_connection_id?: string | null;
          purged_at?: string | null;
          purged_generation?: number | null;
          request_digest?: string;
          resource_deleted_at?: string | null;
          resource_id?: string;
          resource_type?: string;
          resource_version?: string;
          tool_name?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mcp_mutation_receipts_origin_connection_id_fkey';
            columns: ['origin_connection_id'];
            isOneToOne: false;
            referencedRelation: 'oauth_connections';
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
          connection_id: string;
          consumed_at: string | null;
          created_at: string;
          expires_at: string;
          redirect_uri: string;
          resource_uri: string;
          scopes: string[];
          user_id: string;
        };
        Insert: {
          client_id: string;
          code_challenge: string;
          code_challenge_method: string;
          code_hash: string;
          connection_id: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          redirect_uri: string;
          resource_uri: string;
          scopes: string[];
          user_id: string;
        };
        Update: {
          client_id?: string;
          code_challenge?: string;
          code_challenge_method?: string;
          code_hash?: string;
          connection_id?: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          redirect_uri?: string;
          resource_uri?: string;
          scopes?: string[];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'oauth_authorization_codes_connection_binding_fkey';
            columns: ['connection_id', 'user_id', 'client_id', 'resource_uri'];
            isOneToOne: false;
            referencedRelation: 'oauth_connections';
            referencedColumns: ['id', 'user_id', 'client_id', 'resource_uri'];
          },
          {
            foreignKeyName: 'oauth_authorization_codes_environment_resource_fkey';
            columns: ['resource_uri'];
            isOneToOne: false;
            referencedRelation: 'mcp_environment_identity';
            referencedColumns: ['resource_uri'];
          },
        ];
      };
      oauth_connections: {
        Row: {
          authorized_at: string;
          client_id: string;
          consent_version: number;
          created_at: string;
          id: string;
          last_refreshed_at: string | null;
          last_used_at: string | null;
          legacy_read_only: boolean;
          reauth_required_at: string;
          resource_uri: string;
          revoked_at: string | null;
          revoked_reason: string | null;
          scopes: string[];
          updated_at: string;
          user_id: string;
          write_disabled_at: string | null;
          write_enabled_at: string | null;
        };
        Insert: {
          authorized_at?: string;
          client_id: string;
          consent_version?: number;
          created_at?: string;
          id?: string;
          last_refreshed_at?: string | null;
          last_used_at?: string | null;
          legacy_read_only?: boolean;
          reauth_required_at?: string;
          resource_uri: string;
          revoked_at?: string | null;
          revoked_reason?: string | null;
          scopes: string[];
          updated_at?: string;
          user_id: string;
          write_disabled_at?: string | null;
          write_enabled_at?: string | null;
        };
        Update: {
          authorized_at?: string;
          client_id?: string;
          consent_version?: number;
          created_at?: string;
          id?: string;
          last_refreshed_at?: string | null;
          last_used_at?: string | null;
          legacy_read_only?: boolean;
          reauth_required_at?: string;
          resource_uri?: string;
          revoked_at?: string | null;
          revoked_reason?: string | null;
          scopes?: string[];
          updated_at?: string;
          user_id?: string;
          write_disabled_at?: string | null;
          write_enabled_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'oauth_connections_environment_resource_fkey';
            columns: ['resource_uri'];
            isOneToOne: false;
            referencedRelation: 'mcp_environment_identity';
            referencedColumns: ['resource_uri'];
          },
        ];
      };
      oauth_tokens: {
        Row: {
          client_id: string;
          connection_id: string;
          created_at: string;
          expires_at: string;
          id: string;
          last_used_at: string | null;
          parent_token_id: string | null;
          resource_uri: string;
          revoked_at: string | null;
          rotated_at: string | null;
          scopes: string[];
          token_hash: string;
          token_type: string;
          user_id: string;
        };
        Insert: {
          client_id: string;
          connection_id: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          last_used_at?: string | null;
          parent_token_id?: string | null;
          resource_uri: string;
          revoked_at?: string | null;
          rotated_at?: string | null;
          scopes?: string[];
          token_hash: string;
          token_type: string;
          user_id: string;
        };
        Update: {
          client_id?: string;
          connection_id?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          last_used_at?: string | null;
          parent_token_id?: string | null;
          resource_uri?: string;
          revoked_at?: string | null;
          rotated_at?: string | null;
          scopes?: string[];
          token_hash?: string;
          token_type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'oauth_tokens_connection_binding_fkey';
            columns: ['connection_id', 'user_id', 'client_id', 'resource_uri'];
            isOneToOne: false;
            referencedRelation: 'oauth_connections';
            referencedColumns: ['id', 'user_id', 'client_id', 'resource_uri'];
          },
          {
            foreignKeyName: 'oauth_tokens_environment_resource_fkey';
            columns: ['resource_uri'];
            isOneToOne: false;
            referencedRelation: 'mcp_environment_identity';
            referencedColumns: ['resource_uri'];
          },
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
      apply_mcp_plan_create_v1: {
        Args: {
          p_access_token_id: string;
          p_connection_id: string;
          p_end_at: string;
          p_note: string;
          p_operation_id: string;
          p_start_at: string;
          p_tag_id: string;
          p_title: string;
        };
        Returns: {
          deleted_at: string;
          operation_id: string;
          replayed: boolean;
          resource_id: string;
          resource_type: string;
          schema_version: number;
          version: string;
        }[];
      };
      apply_mcp_plan_delete_v1: {
        Args: {
          p_access_token_id: string;
          p_connection_id: string;
          p_expected_updated_at: string;
          p_operation_id: string;
          p_plan_id: string;
        };
        Returns: {
          deleted_at: string;
          operation_id: string;
          replayed: boolean;
          resource_id: string;
          resource_type: string;
          schema_version: number;
          version: string;
        }[];
      };
      apply_mcp_plan_restore_v1: {
        Args: {
          p_access_token_id: string;
          p_connection_id: string;
          p_expected_updated_at: string;
          p_operation_id: string;
          p_plan_id: string;
        };
        Returns: {
          deleted_at: string;
          operation_id: string;
          replayed: boolean;
          resource_id: string;
          resource_type: string;
          schema_version: number;
          version: string;
        }[];
      };
      apply_mcp_plan_update_v1: {
        Args: {
          p_access_token_id: string;
          p_connection_id: string;
          p_end_at: string;
          p_end_at_present: boolean;
          p_expected_updated_at: string;
          p_note: string;
          p_note_present: boolean;
          p_operation_id: string;
          p_plan_id: string;
          p_start_at: string;
          p_start_at_present: boolean;
          p_tag_id: string;
          p_tag_id_present: boolean;
          p_title: string;
          p_title_present: boolean;
        };
        Returns: {
          deleted_at: string;
          operation_id: string;
          replayed: boolean;
          resource_id: string;
          resource_type: string;
          schema_version: number;
          version: string;
        }[];
      };
      apply_mcp_record_create_v1: {
        Args: {
          p_access_token_id: string;
          p_connection_id: string;
          p_end_at: string;
          p_note: string;
          p_operation_id: string;
          p_plan_id: string;
          p_start_at: string;
          p_tag_id: string;
          p_title: string;
        };
        Returns: {
          deleted_at: string;
          operation_id: string;
          replayed: boolean;
          resource_id: string;
          resource_type: string;
          schema_version: number;
          version: string;
        }[];
      };
      apply_mcp_record_delete_v1: {
        Args: {
          p_access_token_id: string;
          p_connection_id: string;
          p_expected_updated_at: string;
          p_operation_id: string;
          p_record_id: string;
        };
        Returns: {
          deleted_at: string;
          operation_id: string;
          replayed: boolean;
          resource_id: string;
          resource_type: string;
          schema_version: number;
          version: string;
        }[];
      };
      apply_mcp_record_restore_v1: {
        Args: {
          p_access_token_id: string;
          p_connection_id: string;
          p_expected_updated_at: string;
          p_operation_id: string;
          p_record_id: string;
        };
        Returns: {
          deleted_at: string;
          operation_id: string;
          replayed: boolean;
          resource_id: string;
          resource_type: string;
          schema_version: number;
          version: string;
        }[];
      };
      apply_mcp_record_update_v1: {
        Args: {
          p_access_token_id: string;
          p_connection_id: string;
          p_end_at: string;
          p_end_at_present: boolean;
          p_expected_updated_at: string;
          p_note: string;
          p_note_present: boolean;
          p_operation_id: string;
          p_record_id: string;
          p_start_at: string;
          p_start_at_present: boolean;
          p_tag_id: string;
          p_tag_id_present: boolean;
          p_title: string;
          p_title_present: boolean;
        };
        Returns: {
          deleted_at: string;
          operation_id: string;
          replayed: boolean;
          resource_id: string;
          resource_type: string;
          schema_version: number;
          version: string;
        }[];
      };
      assert_active_timeblock_tag_v1: {
        Args: { p_tag_id: string; p_user_id: string };
        Returns: undefined;
      };
      assert_timeblock_content_v1: {
        Args: { p_note: string; p_title: string };
        Returns: undefined;
      };
      assert_timeblock_external_event_v1: {
        Args: { p_external_calendar_event_id: string; p_user_id: string };
        Returns: undefined;
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
      claim_calendar_revoke_outbox_v1: {
        Args: { p_limit?: number };
        Returns: {
          attempt_count: number;
          expires_at: string;
          lease_id: string;
          outbox_id: string;
          provider: string;
          refresh_token_enc: string;
        }[];
      };
      claim_stripe_webhook_event: {
        Args: {
          p_event_id: string;
          p_event_type: string;
          p_stale_before: string;
        };
        Returns: string;
      };
      cleanup_integration_security_events_v1: {
        Args: { p_limit?: number };
        Returns: number;
      };
      cleanup_mcp_mutation_receipts_v1: {
        Args: { p_limit?: number };
        Returns: number;
      };
      cleanup_oauth_access_tokens_v1: {
        Args: { p_limit?: number };
        Returns: number;
      };
      cleanup_oauth_authorization_codes_v1: {
        Args: { p_limit?: number };
        Returns: number;
      };
      cleanup_oauth_connections_v1: {
        Args: { p_limit?: number };
        Returns: number;
      };
      cleanup_oauth_refresh_tokens_v1: {
        Args: { p_limit?: number };
        Returns: number;
      };
      complete_calendar_revoke_outbox_v1: {
        Args: { p_lease_id: string; p_outbox_id: string };
        Returns: boolean;
      };
      confirm_day_plans_command_v1: {
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
      create_oauth_authorization_grant_v2: {
        Args: {
          p_client_id: string;
          p_code_challenge: string;
          p_code_hash: string;
          p_redirect_uri: string;
          p_resource_uri: string;
          p_scopes: string[];
          p_user_id: string;
          p_write_enabled?: boolean;
        };
        Returns: string;
      };
      create_plan_command_v1: {
        Args: {
          p_end_at: string;
          p_external_calendar_event_id: string;
          p_note: string;
          p_source: string;
          p_start_at: string;
          p_tag_id: string;
          p_title: string;
          p_user_id: string;
        };
        Returns: {
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
        }[];
        SetofOptions: {
          from: '*';
          to: 'plans';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      create_record_command_v1: {
        Args: {
          p_end_at: string;
          p_external_calendar_event_id: string;
          p_note: string;
          p_plan_id: string;
          p_source: string;
          p_start_at: string;
          p_tag_id: string;
          p_title: string;
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
      custom_access_token_hook: { Args: { event: Json }; Returns: Json };
      delete_all_user_data_command_v1: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      delete_all_user_data_command_v2: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      delete_all_user_data_command_v3: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      delete_plan_command_v1: {
        Args: {
          p_expected_updated_at: string;
          p_plan_id: string;
          p_user_id: string;
        };
        Returns: {
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
        }[];
        SetofOptions: {
          from: '*';
          to: 'plans';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      delete_record_command_v1: {
        Args: {
          p_expected_updated_at: string;
          p_record_id: string;
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
      delete_tags_with_timeblocks_command_v2: {
        Args: {
          p_promote_children: boolean;
          p_strategy: string;
          p_tag_ids: string[];
          p_target_tag_id: string;
          p_user_id: string;
        };
        Returns: number;
      };
      delete_tags_with_timeblocks_command_v3: {
        Args: {
          p_promote_children: boolean;
          p_strategy: string;
          p_tag_ids: string[];
          p_target_tag_id: string;
          p_user_id: string;
        };
        Returns: number;
      };
      delete_user_timeblocks_command_v1: {
        Args: { p_user_id: string };
        Returns: number;
      };
      delete_user_timeblocks_command_v2: {
        Args: { p_user_id: string };
        Returns: number;
      };
      disable_oauth_connection_writes_v1: {
        Args: { p_connection_id: string };
        Returns: string;
      };
      exchange_oauth_authorization_code_v2: {
        Args: {
          p_access_hash: string;
          p_client_id: string;
          p_code_challenge: string;
          p_code_hash: string;
          p_redirect_uri: string;
          p_refresh_hash: string;
          p_resource_uri: string;
        };
        Returns: {
          access_expires_at: string;
          access_id: string;
          client_id: string;
          connection_id: string;
          refresh_id: string;
          resource_uri: string;
          scopes: string[];
          user_id: string;
        }[];
      };
      expire_calendar_revoke_outbox_v1: {
        Args: { p_limit?: number };
        Returns: number;
      };
      get_external_authority_maintenance_status_v1: {
        Args: never;
        Returns: {
          access_tokens_due: boolean;
          authorization_codes_due: boolean;
          calendar_revoke_due: number;
          calendar_revoke_total: number;
          connections_due: boolean;
          oldest_due_age_seconds: number;
          receipts_due: boolean;
          refresh_tokens_due: boolean;
          security_events_due: boolean;
        }[];
      };
      get_mcp_environment_identity_v1: {
        Args: never;
        Returns: {
          authorization_server_uri: string;
          environment: string;
          provisioned_at: string;
          resource_uri: string;
        }[];
      };
      get_timeblock_context_marker_v1: {
        Args: { p_user_id: string };
        Returns: {
          database_now: string;
          revision: string;
          timezone: string;
        }[];
      };
      get_user_data_generation_v1: {
        Args: { p_user_id: string };
        Returns: number;
      };
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
      lock_recordable_plan_v1: {
        Args: { p_plan_id: string; p_user_id: string };
        Returns: {
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
        SetofOptions: {
          from: '*';
          to: 'plans';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      merge_tags_with_hierarchy: {
        Args: {
          p_source_tag_id: string;
          p_target_tag_id: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      provision_mcp_environment_identity_v1: {
        Args: {
          p_authorization_server_uri: string;
          p_environment: string;
          p_resource_uri: string;
        };
        Returns: {
          authorization_server_uri: string;
          environment: string;
          provisioned_at: string;
          resource_uri: string;
        }[];
      };
      record_plan_command_v1: {
        Args: {
          p_expected_updated_at: string;
          p_plan_id: string;
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
      restore_plan_command_v1: {
        Args: {
          p_expected_updated_at: string;
          p_plan_id: string;
          p_user_id: string;
        };
        Returns: {
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
        }[];
        SetofOptions: {
          from: '*';
          to: 'plans';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      restore_record: {
        Args: { p_record_id: string; p_user_id: string };
        Returns: undefined;
      };
      restore_record_command_v1: {
        Args: {
          p_expected_updated_at: string;
          p_record_id: string;
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
      retry_calendar_revoke_outbox_v1: {
        Args: { p_lease_id: string; p_outbox_id: string };
        Returns: string;
      };
      revoke_oauth_connection: {
        Args: { p_connection_id: string };
        Returns: boolean;
      };
      rotate_oauth_refresh_token_v2: {
        Args: {
          p_client_id: string;
          p_new_access_hash: string;
          p_new_refresh_hash: string;
          p_refresh_hash: string;
          p_resource_uri: string;
        };
        Returns: {
          access_expires_at: string;
          access_id: string;
          client_id: string;
          connection_id: string;
          refresh_id: string;
          resource_uri: string;
          scopes: string[];
          status: string;
          user_id: string;
        }[];
      };
      save_calendar_connection_command_v1: {
        Args: {
          p_expected_generation: number;
          p_granted_scopes: string[];
          p_provider: string;
          p_provider_account_email: string;
          p_provider_account_id: string;
          p_refresh_token_enc: string;
          p_user_id: string;
        };
        Returns: string;
      };
      set_mcp_client_write_control_v1: {
        Args: {
          p_client_id: string;
          p_enabled: boolean;
          p_expected_revision: number;
        };
        Returns: {
          changed_at: string;
          disabled_connection_count: number;
          enabled_client_ids: string[];
          revision: number;
        }[];
      };
      set_mcp_mutation_control_v1: {
        Args: { p_expected_revision: number; p_writes_enabled: boolean };
        Returns: {
          changed_at: string;
          revision: number;
          writes_enabled: boolean;
        }[];
      };
      set_plan_skipped_command_v1: {
        Args: {
          p_expected_updated_at: string;
          p_plan_id: string;
          p_skipped: boolean;
          p_user_id: string;
        };
        Returns: {
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
        }[];
        SetofOptions: {
          from: '*';
          to: 'plans';
          isOneToOne: false;
          isSetofReturn: true;
        };
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
      update_plan_command_v1: {
        Args: {
          p_end_at: string;
          p_expected_updated_at: string;
          p_external_calendar_event_id: string;
          p_note: string;
          p_plan_id: string;
          p_start_at: string;
          p_tag_id: string;
          p_title: string;
          p_user_id: string;
        };
        Returns: {
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
        }[];
        SetofOptions: {
          from: '*';
          to: 'plans';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      update_record_command_v1: {
        Args: {
          p_end_at: string;
          p_expected_updated_at: string;
          p_external_calendar_event_id: string;
          p_note: string;
          p_plan_id: string;
          p_record_id: string;
          p_start_at: string;
          p_tag_id: string;
          p_title: string;
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
