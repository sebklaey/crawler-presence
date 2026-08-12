export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      analytics_daily_rollups: {
        Row: {
          created_at: string
          date: string
          event_count: number
          event_type: string
          id: string
          presence_slug: string
          source_type: string
          unique_sessions: number
        }
        Insert: {
          created_at?: string
          date: string
          event_count?: number
          event_type: string
          id?: string
          presence_slug: string
          source_type: string
          unique_sessions?: number
        }
        Update: {
          created_at?: string
          date?: string
          event_count?: number
          event_type?: string
          id?: string
          presence_slug?: string
          source_type?: string
          unique_sessions?: number
        }
        Relationships: [
          {
            foreignKeyName: "analytics_daily_rollups_presence_slug_fkey"
            columns: ["presence_slug"]
            isOneToOne: false
            referencedRelation: "published_presences"
            referencedColumns: ["slug"]
          },
        ]
      }
      analytics_events: {
        Row: {
          anonymous_session_hash: string | null
          confidence: number | null
          created_at: string
          entity_match: string | null
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          presence_slug: string
          public_source_url: string | null
          referrer_category: string | null
          resource_path: string | null
          source_type: string
        }
        Insert: {
          anonymous_session_hash?: string | null
          confidence?: number | null
          created_at?: string
          entity_match?: string | null
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          presence_slug: string
          public_source_url?: string | null
          referrer_category?: string | null
          resource_path?: string | null
          source_type: string
        }
        Update: {
          anonymous_session_hash?: string | null
          confidence?: number | null
          created_at?: string
          entity_match?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          presence_slug?: string
          public_source_url?: string | null
          referrer_category?: string | null
          resource_path?: string | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_presence_slug_fkey"
            columns: ["presence_slug"]
            isOneToOne: false
            referencedRelation: "published_presences"
            referencedColumns: ["slug"]
          },
        ]
      }
      analytics_integrations: {
        Row: {
          configuration: Json
          connection_status: string
          created_at: string
          id: string
          integration_type: string
          last_synced_at: string | null
          presence_slug: string
          updated_at: string
        }
        Insert: {
          configuration?: Json
          connection_status?: string
          created_at?: string
          id?: string
          integration_type: string
          last_synced_at?: string | null
          presence_slug: string
          updated_at?: string
        }
        Update: {
          configuration?: Json
          connection_status?: string
          created_at?: string
          id?: string
          integration_type?: string
          last_synced_at?: string | null
          presence_slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_integrations_presence_slug_fkey"
            columns: ["presence_slug"]
            isOneToOne: false
            referencedRelation: "published_presences"
            referencedColumns: ["slug"]
          },
        ]
      }
      cancellation_feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          outcome: string
          plan: string | null
          presence_slug: string | null
          reason_code: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          outcome?: string
          plan?: string | null
          presence_slug?: string | null
          reason_code: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          outcome?: string
          plan?: string | null
          presence_slug?: string | null
          reason_code?: string
        }
        Relationships: []
      }
      funnel_events: {
        Row: {
          error_category: string | null
          event_type: string
          from_step: string | null
          id: string
          occurred_at: string
          plan: string | null
          presence_slug: string | null
          session_hash: string
          to_step: string | null
        }
        Insert: {
          error_category?: string | null
          event_type: string
          from_step?: string | null
          id?: string
          occurred_at?: string
          plan?: string | null
          presence_slug?: string | null
          session_hash: string
          to_step?: string | null
        }
        Update: {
          error_category?: string | null
          event_type?: string
          from_step?: string | null
          id?: string
          occurred_at?: string
          plan?: string | null
          presence_slug?: string | null
          session_hash?: string
          to_step?: string | null
        }
        Relationships: []
      }
      improvement_recommendations: {
        Row: {
          affected_files: string[]
          change_id: string | null
          confidence: string
          created_at: string
          current_value: string | null
          decided_at: string | null
          dedupe_key: string | null
          evidence: string | null
          expected_benefit: string | null
          field_path: string
          id: string
          issue: string
          kind: string
          presence_slug: string
          proposed_value: string | null
          published_at: string | null
          rejection_reason: string | null
          state: string
          updated_at: string
          verification_status: string
        }
        Insert: {
          affected_files?: string[]
          change_id?: string | null
          confidence?: string
          created_at?: string
          current_value?: string | null
          decided_at?: string | null
          dedupe_key?: string | null
          evidence?: string | null
          expected_benefit?: string | null
          field_path: string
          id?: string
          issue: string
          kind: string
          presence_slug: string
          proposed_value?: string | null
          published_at?: string | null
          rejection_reason?: string | null
          state?: string
          updated_at?: string
          verification_status?: string
        }
        Update: {
          affected_files?: string[]
          change_id?: string | null
          confidence?: string
          created_at?: string
          current_value?: string | null
          decided_at?: string | null
          dedupe_key?: string | null
          evidence?: string | null
          expected_benefit?: string | null
          field_path?: string
          id?: string
          issue?: string
          kind?: string
          presence_slug?: string
          proposed_value?: string | null
          published_at?: string | null
          rejection_reason?: string | null
          state?: string
          updated_at?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "improvement_recommendations_change_id_fkey"
            columns: ["change_id"]
            isOneToOne: false
            referencedRelation: "source_changes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "improvement_recommendations_presence_slug_fkey"
            columns: ["presence_slug"]
            isOneToOne: false
            referencedRelation: "published_presences"
            referencedColumns: ["slug"]
          },
        ]
      }
      mcp_rate_limits: {
        Row: {
          bucket_key: string
          created_at: string
          hits: number
          id: string
          window_start: string
        }
        Insert: {
          bucket_key: string
          created_at?: string
          hits?: number
          id?: string
          window_start: string
        }
        Update: {
          bucket_key?: string
          created_at?: string
          hits?: number
          id?: string
          window_start?: string
        }
        Relationships: []
      }
      mcp_sessions: {
        Row: {
          complete: boolean
          confidence: number
          core: Json
          created_at: string
          expires_at: string
          id: string
          origin: string
          token: string
          transcript: Json
          updated_at: string
        }
        Insert: {
          complete?: boolean
          confidence?: number
          core?: Json
          created_at?: string
          expires_at?: string
          id?: string
          origin?: string
          token: string
          transcript?: Json
          updated_at?: string
        }
        Update: {
          complete?: boolean
          confidence?: number
          core?: Json
          created_at?: string
          expires_at?: string
          id?: string
          origin?: string
          token?: string
          transcript?: Json
          updated_at?: string
        }
        Relationships: []
      }
      notification_events: {
        Row: {
          channel: string
          created_at: string
          dedupe_key: string
          error: string | null
          event_type: string
          id: string
          presence_slug: string | null
          reason: string | null
          recipient: string | null
          status: string
        }
        Insert: {
          channel?: string
          created_at?: string
          dedupe_key: string
          error?: string | null
          event_type: string
          id?: string
          presence_slug?: string | null
          reason?: string | null
          recipient?: string | null
          status?: string
        }
        Update: {
          channel?: string
          created_at?: string
          dedupe_key?: string
          error?: string | null
          event_type?: string
          id?: string
          presence_slug?: string | null
          reason?: string | null
          recipient?: string | null
          status?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          created_at: string
          environment: string
          error: string | null
          event_id: string
          event_type: string
          id: string
          intent_ref: string | null
          occurred_at: string | null
          processed_at: string | null
          status: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          environment?: string
          error?: string | null
          event_id: string
          event_type: string
          id?: string
          intent_ref?: string | null
          occurred_at?: string | null
          processed_at?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          environment?: string
          error?: string | null
          event_id?: string
          event_type?: string
          id?: string
          intent_ref?: string | null
          occurred_at?: string | null
          processed_at?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      presence_aliases: {
        Row: {
          alias: string
          alias_kind: string
          created_at: string
          id: string
          presence_slug: string
        }
        Insert: {
          alias: string
          alias_kind: string
          created_at?: string
          id?: string
          presence_slug: string
        }
        Update: {
          alias?: string
          alias_kind?: string
          created_at?: string
          id?: string
          presence_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "presence_aliases_presence_slug_fkey"
            columns: ["presence_slug"]
            isOneToOne: false
            referencedRelation: "published_presences"
            referencedColumns: ["slug"]
          },
        ]
      }
      presence_analytics_events: {
        Row: {
          created_at: string
          dedupe_key: string | null
          event_type: string
          file_path: string | null
          id: string
          occurred_at: string
          presence_slug: string
          session_fingerprint: string | null
          source: string
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          event_type: string
          file_path?: string | null
          id?: string
          occurred_at?: string
          presence_slug: string
          session_fingerprint?: string | null
          source?: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          event_type?: string
          file_path?: string | null
          id?: string
          occurred_at?: string
          presence_slug?: string
          session_fingerprint?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "presence_analytics_events_presence_slug_fkey"
            columns: ["presence_slug"]
            isOneToOne: false
            referencedRelation: "published_presences"
            referencedColumns: ["slug"]
          },
        ]
      }
      presence_health_scores: {
        Row: {
          computed_at: string
          id: string
          presence_slug: string
          reasons: Json
          score: number
          state: string
        }
        Insert: {
          computed_at?: string
          id?: string
          presence_slug: string
          reasons?: Json
          score: number
          state: string
        }
        Update: {
          computed_at?: string
          id?: string
          presence_slug?: string
          reasons?: Json
          score?: number
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "presence_health_scores_presence_slug_fkey"
            columns: ["presence_slug"]
            isOneToOne: false
            referencedRelation: "published_presences"
            referencedColumns: ["slug"]
          },
        ]
      }
      presence_sources: {
        Row: {
          approved: boolean
          consecutive_failures: number
          created_at: string
          id: string
          label: string | null
          last_error: string | null
          last_scanned_at: string | null
          last_status: string | null
          presence_slug: string
          scan_frequency: string
          updated_at: string
          url: string
        }
        Insert: {
          approved?: boolean
          consecutive_failures?: number
          created_at?: string
          id?: string
          label?: string | null
          last_error?: string | null
          last_scanned_at?: string | null
          last_status?: string | null
          presence_slug: string
          scan_frequency?: string
          updated_at?: string
          url: string
        }
        Update: {
          approved?: boolean
          consecutive_failures?: number
          created_at?: string
          id?: string
          label?: string | null
          last_error?: string | null
          last_scanned_at?: string | null
          last_status?: string | null
          presence_slug?: string
          scan_frequency?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "presence_sources_presence_slug_fkey"
            columns: ["presence_slug"]
            isOneToOne: false
            referencedRelation: "published_presences"
            referencedColumns: ["slug"]
          },
        ]
      }
      presence_team_members: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          label: string
          last_used_at: string | null
          presence_slug: string
          revoked_at: string | null
          role: string
          updated_at: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          label: string
          last_used_at?: string | null
          presence_slug: string
          revoked_at?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          label?: string
          last_used_at?: string | null
          presence_slug?: string
          revoked_at?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "presence_team_members_presence_slug_fkey"
            columns: ["presence_slug"]
            isOneToOne: false
            referencedRelation: "published_presences"
            referencedColumns: ["slug"]
          },
        ]
      }
      publish_intents: {
        Row: {
          billing_checkout_id: string | null
          billing_customer_id: string | null
          billing_subscription_id: string | null
          created_at: string
          current_period_end: string | null
          environment: string
          expires_at: string
          failure_reason: string | null
          id: string
          intent_ref: string
          last_event_id: string | null
          plan: string
          presence_slug: string | null
          session_token: string | null
          status: string
          subscription_status: string | null
          updated_at: string
        }
        Insert: {
          billing_checkout_id?: string | null
          billing_customer_id?: string | null
          billing_subscription_id?: string | null
          created_at?: string
          current_period_end?: string | null
          environment?: string
          expires_at?: string
          failure_reason?: string | null
          id?: string
          intent_ref: string
          last_event_id?: string | null
          plan?: string
          presence_slug?: string | null
          session_token?: string | null
          status?: string
          subscription_status?: string | null
          updated_at?: string
        }
        Update: {
          billing_checkout_id?: string | null
          billing_customer_id?: string | null
          billing_subscription_id?: string | null
          created_at?: string
          current_period_end?: string | null
          environment?: string
          expires_at?: string
          failure_reason?: string | null
          id?: string
          intent_ref?: string
          last_event_id?: string | null
          plan?: string
          presence_slug?: string | null
          session_token?: string | null
          status?: string
          subscription_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      published_presences: {
        Row: {
          baseline: Json | null
          baseline_at: string | null
          billing_customer_id: string | null
          billing_subscription_id: string | null
          claim_token: string | null
          core: Json
          created_at: string
          current_period_end: string | null
          custom_domain: string | null
          custom_domain_token: string | null
          custom_domain_verified_at: string | null
          files: Json
          id: string
          intent_ref: string | null
          last_source_scan_at: string | null
          manage_secret_hash: string | null
          manage_secret_updated_at: string
          mode: string
          notify_billing: boolean
          notify_reports: boolean
          notify_source_changes: boolean
          plan: string
          publication_error: string | null
          publication_state: string
          published_version: number
          report_email: string | null
          report_frequency: string
          report_last_sent_at: string | null
          session_token: string | null
          slug: string
          status: string
          subscription_status: string | null
          unpublished_at: string | null
          updated_at: string
        }
        Insert: {
          baseline?: Json | null
          baseline_at?: string | null
          billing_customer_id?: string | null
          billing_subscription_id?: string | null
          claim_token?: string | null
          core: Json
          created_at?: string
          current_period_end?: string | null
          custom_domain?: string | null
          custom_domain_token?: string | null
          custom_domain_verified_at?: string | null
          files?: Json
          id?: string
          intent_ref?: string | null
          last_source_scan_at?: string | null
          manage_secret_hash?: string | null
          manage_secret_updated_at?: string
          mode?: string
          notify_billing?: boolean
          notify_reports?: boolean
          notify_source_changes?: boolean
          plan?: string
          publication_error?: string | null
          publication_state?: string
          published_version?: number
          report_email?: string | null
          report_frequency?: string
          report_last_sent_at?: string | null
          session_token?: string | null
          slug: string
          status?: string
          subscription_status?: string | null
          unpublished_at?: string | null
          updated_at?: string
        }
        Update: {
          baseline?: Json | null
          baseline_at?: string | null
          billing_customer_id?: string | null
          billing_subscription_id?: string | null
          claim_token?: string | null
          core?: Json
          created_at?: string
          current_period_end?: string | null
          custom_domain?: string | null
          custom_domain_token?: string | null
          custom_domain_verified_at?: string | null
          files?: Json
          id?: string
          intent_ref?: string | null
          last_source_scan_at?: string | null
          manage_secret_hash?: string | null
          manage_secret_updated_at?: string
          mode?: string
          notify_billing?: boolean
          notify_reports?: boolean
          notify_source_changes?: boolean
          plan?: string
          publication_error?: string | null
          publication_state?: string
          published_version?: number
          report_email?: string | null
          report_frequency?: string
          report_last_sent_at?: string | null
          session_token?: string | null
          slug?: string
          status?: string
          subscription_status?: string | null
          unpublished_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      source_changes: {
        Row: {
          classification: string
          created_at: string
          detected_at: string
          evidence: string | null
          id: string
          presence_slug: string
          resolved_at: string | null
          source_id: string | null
          status: string
          summary: string
          updated_at: string
        }
        Insert: {
          classification: string
          created_at?: string
          detected_at?: string
          evidence?: string | null
          id?: string
          presence_slug: string
          resolved_at?: string | null
          source_id?: string | null
          status?: string
          summary: string
          updated_at?: string
        }
        Update: {
          classification?: string
          created_at?: string
          detected_at?: string
          evidence?: string | null
          id?: string
          presence_slug?: string
          resolved_at?: string | null
          source_id?: string | null
          status?: string
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_changes_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "presence_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      source_snapshots: {
        Row: {
          byte_size: number | null
          excerpt: string | null
          fetched_at: string
          fingerprint: string
          http_status: number | null
          id: string
          presence_slug: string
          source_id: string
        }
        Insert: {
          byte_size?: number | null
          excerpt?: string | null
          fetched_at?: string
          fingerprint: string
          http_status?: number | null
          id?: string
          presence_slug: string
          source_id: string
        }
        Update: {
          byte_size?: number | null
          excerpt?: string | null
          fetched_at?: string
          fingerprint?: string
          http_status?: number | null
          id?: string
          presence_slug?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_snapshots_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "presence_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          created_at: string
          delivered: boolean
          email: string
          id: string
          is_follow_up: boolean
          message: string
          notified_at: string | null
          notified_status: string | null
          presence_slug: string | null
          status: string
          subject: string
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivered?: boolean
          email: string
          id?: string
          is_follow_up?: boolean
          message: string
          notified_at?: string | null
          notified_status?: string | null
          presence_slug?: string | null
          status?: string
          subject: string
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivered?: boolean
          email?: string
          id?: string
          is_follow_up?: boolean
          message?: string
          notified_at?: string | null
          notified_status?: string | null
          presence_slug?: string | null
          status?: string
          subject?: string
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      visibility_benchmarks: {
        Row: {
          created_at: string
          description_correct: boolean | null
          detected_issues: Json
          entity_mentioned: boolean
          id: string
          model: string
          position: number | null
          presence_slug: string
          prompt_key: string
          prompt_version: string
          provider: string
          result_summary: string | null
          source_cited: boolean
          tested_at: string
        }
        Insert: {
          created_at?: string
          description_correct?: boolean | null
          detected_issues?: Json
          entity_mentioned?: boolean
          id?: string
          model: string
          position?: number | null
          presence_slug: string
          prompt_key: string
          prompt_version?: string
          provider: string
          result_summary?: string | null
          source_cited?: boolean
          tested_at?: string
        }
        Update: {
          created_at?: string
          description_correct?: boolean | null
          detected_issues?: Json
          entity_mentioned?: boolean
          id?: string
          model?: string
          position?: number | null
          presence_slug?: string
          prompt_key?: string
          prompt_version?: string
          provider?: string
          result_summary?: string | null
          source_cited?: boolean
          tested_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visibility_benchmarks_presence_slug_fkey"
            columns: ["presence_slug"]
            isOneToOne: false
            referencedRelation: "published_presences"
            referencedColumns: ["slug"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
