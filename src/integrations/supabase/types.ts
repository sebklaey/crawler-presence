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
      accounts: {
        Row: {
          created_at: string
          display_alias: string | null
          email: string | null
          id: string
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_alias?: string | null
          email?: string | null
          id?: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_alias?: string | null
          email?: string | null
          id?: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_referral_domains: {
        Row: {
          active: boolean
          created_at: string
          domain: string
          id: string
          provider: string
          surface: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          domain: string
          id?: string
          provider: string
          surface?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          domain?: string
          id?: string
          provider?: string
          surface?: string | null
        }
        Relationships: []
      }
      analytics_connector_syncs: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          presence_slug: string
          records_read: number
          records_skipped: number
          records_written: number
          source_type: string
          started_at: string
          status: string
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          presence_slug: string
          records_read?: number
          records_skipped?: number
          records_written?: number
          source_type: string
          started_at?: string
          status?: string
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          presence_slug?: string
          records_read?: number
          records_skipped?: number
          records_written?: number
          source_type?: string
          started_at?: string
          status?: string
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      analytics_daily_rollups: {
        Row: {
          created_at: string
          date: string
          event_count: number
          event_type: string
          evidence_type: string
          id: string
          presence_slug: string
          provider: string | null
          source_type: string
          unique_sessions: number
        }
        Insert: {
          created_at?: string
          date: string
          event_count?: number
          event_type: string
          evidence_type?: string
          id?: string
          presence_slug: string
          provider?: string | null
          source_type: string
          unique_sessions?: number
        }
        Update: {
          created_at?: string
          date?: string
          event_count?: number
          event_type?: string
          evidence_type?: string
          id?: string
          presence_slug?: string
          provider?: string | null
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
          citation_url: string | null
          cited: boolean | null
          confidence: number | null
          created_at: string
          entity_match: string | null
          event_type: string
          evidence_type: string
          http_status: number | null
          id: string
          idempotency_key: string | null
          locale: string | null
          mentioned: boolean | null
          metadata: Json
          model: string | null
          occurred_at: string
          path: string | null
          presence_slug: string
          prompt_id: string | null
          prompt_version: string | null
          provider: string | null
          public_source_url: string | null
          recommended: boolean | null
          referrer: string | null
          referrer_category: string | null
          region: string | null
          request_id: string | null
          resource_path: string | null
          response_bytes: number | null
          source_event_id: string | null
          source_type: string
          surface: string | null
          user_agent_family: string | null
          verified_bot: boolean
        }
        Insert: {
          anonymous_session_hash?: string | null
          citation_url?: string | null
          cited?: boolean | null
          confidence?: number | null
          created_at?: string
          entity_match?: string | null
          event_type: string
          evidence_type?: string
          http_status?: number | null
          id?: string
          idempotency_key?: string | null
          locale?: string | null
          mentioned?: boolean | null
          metadata?: Json
          model?: string | null
          occurred_at?: string
          path?: string | null
          presence_slug: string
          prompt_id?: string | null
          prompt_version?: string | null
          provider?: string | null
          public_source_url?: string | null
          recommended?: boolean | null
          referrer?: string | null
          referrer_category?: string | null
          region?: string | null
          request_id?: string | null
          resource_path?: string | null
          response_bytes?: number | null
          source_event_id?: string | null
          source_type: string
          surface?: string | null
          user_agent_family?: string | null
          verified_bot?: boolean
        }
        Update: {
          anonymous_session_hash?: string | null
          citation_url?: string | null
          cited?: boolean | null
          confidence?: number | null
          created_at?: string
          entity_match?: string | null
          event_type?: string
          evidence_type?: string
          http_status?: number | null
          id?: string
          idempotency_key?: string | null
          locale?: string | null
          mentioned?: boolean | null
          metadata?: Json
          model?: string | null
          occurred_at?: string
          path?: string | null
          presence_slug?: string
          prompt_id?: string | null
          prompt_version?: string | null
          provider?: string | null
          public_source_url?: string | null
          recommended?: boolean | null
          referrer?: string | null
          referrer_category?: string | null
          region?: string | null
          request_id?: string | null
          resource_path?: string | null
          response_bytes?: number | null
          source_event_id?: string | null
          source_type?: string
          surface?: string | null
          user_agent_family?: string | null
          verified_bot?: boolean
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
      analytics_sources: {
        Row: {
          configuration: Json
          created_at: string
          id: string
          last_error: string | null
          last_synced_at: string | null
          next_sync_at: string | null
          presence_slug: string
          records_imported: number
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          configuration?: Json
          created_at?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          next_sync_at?: string | null
          presence_slug: string
          records_imported?: number
          source_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          configuration?: Json
          created_at?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          next_sync_at?: string | null
          presence_slug?: string
          records_imported?: number
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_sources_presence_slug_fkey"
            columns: ["presence_slug"]
            isOneToOne: false
            referencedRelation: "published_presences"
            referencedColumns: ["slug"]
          },
        ]
      }
      anonymous_identities: {
        Row: {
          account_id: string | null
          custom_alias: string | null
          first_seen_at: string
          last_seen_at: string
          subject_hash: string
        }
        Insert: {
          account_id?: string | null
          custom_alias?: string | null
          first_seen_at?: string
          last_seen_at?: string
          subject_hash: string
        }
        Update: {
          account_id?: string | null
          custom_alias?: string | null
          first_seen_at?: string
          last_seen_at?: string
          subject_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "anonymous_identities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          created_at: string
          id: number
          metadata: Json
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          id?: number
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          id?: number
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      billing_customers: {
        Row: {
          created_at: string
          customer_id: string
          email: string | null
          environment: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          email?: string | null
          environment?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          email?: string | null
          environment?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      billing_subscriptions: {
        Row: {
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          customer_id: string
          environment: string
          plan: string | null
          price_id: string | null
          product_id: string | null
          scheduled_change_action: string | null
          scheduled_change_at: string | null
          status: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          customer_id: string
          environment?: string
          plan?: string | null
          price_id?: string | null
          product_id?: string | null
          scheduled_change_action?: string | null
          scheduled_change_at?: string | null
          status: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          customer_id?: string
          environment?: string
          plan?: string | null
          price_id?: string | null
          product_id?: string | null
          scheduled_change_action?: string | null
          scheduled_change_at?: string | null
          status?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      campaign_budgets: {
        Row: {
          campaign_id: string
          cost_per_entry_cents: number
          created_at: string
          currency: string
          daily_cap_cents: number | null
          id: string
          spent_cents: number
          total_budget_cents: number
          updated_at: string
        }
        Insert: {
          campaign_id: string
          cost_per_entry_cents?: number
          created_at?: string
          currency?: string
          daily_cap_cents?: number | null
          id?: string
          spent_cents?: number
          total_budget_cents?: number
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          cost_per_entry_cents?: number
          created_at?: string
          currency?: string
          daily_cap_cents?: number | null
          id?: string
          spent_cents?: number
          total_budget_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_budgets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "sponsored_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_impression_log: {
        Row: {
          campaign_id: string
          created_at: string
          id: number
          subject_hash: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: number
          subject_hash: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: number
          subject_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_impression_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sponsored_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_metrics: {
        Row: {
          campaign_id: string
          cta_clicks: number
          day: string
          entries: number
          event_signups: number
          hides: number
          id: number
          impressions: number
          reports: number
          spend_cents: number
          unique_viewers: number
        }
        Insert: {
          campaign_id: string
          cta_clicks?: number
          day?: string
          entries?: number
          event_signups?: number
          hides?: number
          id?: number
          impressions?: number
          reports?: number
          spend_cents?: number
          unique_viewers?: number
        }
        Update: {
          campaign_id?: string
          cta_clicks?: number
          day?: string
          entries?: number
          event_signups?: number
          hides?: number
          id?: number
          impressions?: number
          reports?: number
          spend_cents?: number
          unique_viewers?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_metrics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sponsored_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_reviews: {
        Row: {
          campaign_id: string
          created_at: string
          decision: string
          id: string
          reason: string | null
          reviewer_account_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          decision: string
          id?: string
          reason?: string | null
          reviewer_account_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          decision?: string
          id?: string
          reason?: string | null
          reviewer_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_reviews_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sponsored_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_reviews_reviewer_account_id_fkey"
            columns: ["reviewer_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
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
      entitlement_overrides: {
        Row: {
          account_id: string
          created_at: string
          expires_at: string | null
          id: string
          key: string
          value: Json
        }
        Insert: {
          account_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          key: string
          value: Json
        }
        Update: {
          account_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          key?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "entitlement_overrides_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          organization_id: string | null
          room_id: string | null
          starts_at: string
          status: string
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          organization_id?: string | null
          room_id?: string | null
          starts_at: string
          status?: string
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          organization_id?: string | null
          room_id?: string | null
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
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
      image_messages: {
        Row: {
          alt_text: string | null
          approved_at: string | null
          checksum: string | null
          created_at: string
          expires_at: string
          file_size: number
          height: number | null
          id: number
          mime_type: string
          moderation_reason: string | null
          moderation_status: string
          room_id: string
          sender_membership_id: string
          storage_path: string
          uploaded: boolean
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          approved_at?: string | null
          checksum?: string | null
          created_at?: string
          expires_at?: string
          file_size?: number
          height?: number | null
          id?: number
          mime_type: string
          moderation_reason?: string | null
          moderation_status?: string
          room_id: string
          sender_membership_id: string
          storage_path: string
          uploaded?: boolean
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          approved_at?: string | null
          checksum?: string | null
          created_at?: string
          expires_at?: string
          file_size?: number
          height?: number | null
          id?: number
          mime_type?: string
          moderation_reason?: string | null
          moderation_status?: string
          room_id?: string
          sender_membership_id?: string
          storage_path?: string
          uploaded?: boolean
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "image_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_messages_sender_membership_id_fkey"
            columns: ["sender_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
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
      invitations: {
        Row: {
          created_at: string
          created_by_account_id: string | null
          expires_at: string | null
          id: string
          max_uses: number | null
          revoked_at: string | null
          room_id: string
          token_hash: string
          used_count: number
        }
        Insert: {
          created_at?: string
          created_by_account_id?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          revoked_at?: string | null
          room_id: string
          token_hash: string
          used_count?: number
        }
        Update: {
          created_at?: string
          created_by_account_id?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          revoked_at?: string | null
          room_id?: string
          token_hash?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "invitations_created_by_account_id_fkey"
            columns: ["created_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
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
      memberships: {
        Row: {
          account_id: string | null
          alias: string
          favorite: boolean
          id: string
          joined_at: string
          last_read_image_id: number | null
          last_read_message_id: number | null
          last_seen_at: string
          left_at: string | null
          pinned: boolean
          role: string
          room_id: string
          subject_hash: string
          topic_id: string | null
        }
        Insert: {
          account_id?: string | null
          alias: string
          favorite?: boolean
          id?: string
          joined_at?: string
          last_read_image_id?: number | null
          last_read_message_id?: number | null
          last_seen_at?: string
          left_at?: string | null
          pinned?: boolean
          role?: string
          room_id: string
          subject_hash: string
          topic_id?: string | null
        }
        Update: {
          account_id?: string | null
          alias?: string
          favorite?: boolean
          id?: string
          joined_at?: string
          last_read_image_id?: number | null
          last_read_message_id?: number | null
          last_seen_at?: string
          left_at?: string | null
          pinned?: boolean
          role?: string
          room_id?: string
          subject_hash?: string
          topic_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reports: {
        Row: {
          campaign_id: string | null
          created_at: string
          id: string
          image_message_id: number | null
          message_id: number | null
          reason: string
          reporter_membership_id: string | null
          reporter_subject_hash: string | null
          status: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          id?: string
          image_message_id?: number | null
          message_id?: number | null
          reason: string
          reporter_membership_id?: string | null
          reporter_subject_hash?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          id?: string
          image_message_id?: number | null
          message_id?: number | null
          reason?: string
          reporter_membership_id?: string | null
          reporter_subject_hash?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reports_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sponsored_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reports_image_message_id_fkey"
            columns: ["image_message_id"]
            isOneToOne: false
            referencedRelation: "image_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reports_reporter_membership_id_fkey"
            columns: ["reporter_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          expires_at: string
          id: number
          idempotency_key: string | null
          membership_id: string
          pinned: boolean
          room_id: string
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          expires_at?: string
          id?: never
          idempotency_key?: string | null
          membership_id: string
          pinned?: boolean
          room_id: string
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          expires_at?: string
          id?: never
          idempotency_key?: string | null
          membership_id?: string
          pinned?: boolean
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_decisions: {
        Row: {
          created_at: string
          decision: string
          id: string
          reason: string | null
          reviewer_account_id: string | null
          source: string
          subject_id: string
          subject_type: string
        }
        Insert: {
          created_at?: string
          decision: string
          id?: string
          reason?: string | null
          reviewer_account_id?: string | null
          source?: string
          subject_id: string
          subject_type: string
        }
        Update: {
          created_at?: string
          decision?: string
          id?: string
          reason?: string | null
          reviewer_account_id?: string | null
          source?: string
          subject_id?: string
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_decisions_reviewer_account_id_fkey"
            columns: ["reviewer_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
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
      organization_members: {
        Row: {
          account_id: string
          created_at: string
          id: string
          organization_id: string
          role: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          organization_id: string
          role?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_ready: boolean
          created_at: string
          description: string | null
          id: string
          logo_path: string | null
          name: string
          owner_account_id: string
          slug: string | null
          suspended_at: string | null
          updated_at: string
          verified: boolean
          verified_at: string | null
          website: string | null
        }
        Insert: {
          billing_ready?: boolean
          created_at?: string
          description?: string | null
          id?: string
          logo_path?: string | null
          name: string
          owner_account_id: string
          slug?: string | null
          suspended_at?: string | null
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          website?: string | null
        }
        Update: {
          billing_ready?: boolean
          created_at?: string
          description?: string | null
          id?: string
          logo_path?: string | null
          name?: string
          owner_account_id?: string
          slug?: string | null
          suspended_at?: string | null
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_owner_account_id_fkey"
            columns: ["owner_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
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
      plans: {
        Row: {
          active: boolean
          code: string
          created_at: string
          currency: string
          entitlements: Json
          id: string
          interval: string
          limits: Json
          name: string
          price_cents: number
          sort_order: number
          stripe_price_id: string | null
          stripe_product_id: string | null
          tagline: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          currency?: string
          entitlements?: Json
          id?: string
          interval?: string
          limits?: Json
          name: string
          price_cents?: number
          sort_order?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          currency?: string
          entitlements?: Json
          id?: string
          interval?: string
          limits?: Json
          name?: string
          price_cents?: number
          sort_order?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_roles: {
        Row: {
          account_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_roles_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      poll_votes: {
        Row: {
          created_at: string
          id: string
          membership_id: string
          option_index: number
          poll_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          membership_id: string
          option_index: number
          poll_id: string
        }
        Update: {
          created_at?: string
          id?: string
          membership_id?: string
          option_index?: number
          poll_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          closes_at: string | null
          created_at: string
          created_by_membership_id: string | null
          id: string
          options: Json
          question: string
          room_id: string
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          id?: string
          options: Json
          question: string
          room_id: string
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          id?: string
          options?: Json
          question?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "polls_created_by_membership_id_fkey"
            columns: ["created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polls_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
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
      probe_citations: {
        Row: {
          created_at: string
          domain: string | null
          id: string
          own_domain: boolean
          presence_slug: string
          rank: number | null
          run_id: string
          title: string | null
          url: string
        }
        Insert: {
          created_at?: string
          domain?: string | null
          id?: string
          own_domain?: boolean
          presence_slug: string
          rank?: number | null
          run_id: string
          title?: string | null
          url: string
        }
        Update: {
          created_at?: string
          domain?: string | null
          id?: string
          own_domain?: boolean
          presence_slug?: string
          rank?: number | null
          run_id?: string
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "probe_citations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "probe_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      probe_definitions: {
        Row: {
          active: boolean
          branded: boolean
          category: string
          competitor_group: string[]
          created_at: string
          id: string
          locale: string
          presence_slug: string
          prompt: string
          prompt_id: string
          prompt_version: string
          recommendation_test: boolean
          region: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          branded?: boolean
          category: string
          competitor_group?: string[]
          created_at?: string
          id?: string
          locale?: string
          presence_slug: string
          prompt: string
          prompt_id: string
          prompt_version?: string
          recommendation_test?: boolean
          region?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          branded?: boolean
          category?: string
          competitor_group?: string[]
          created_at?: string
          id?: string
          locale?: string
          presence_slug?: string
          prompt?: string
          prompt_id?: string
          prompt_version?: string
          recommendation_test?: boolean
          region?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "probe_definitions_presence_slug_fkey"
            columns: ["presence_slug"]
            isOneToOne: false
            referencedRelation: "published_presences"
            referencedColumns: ["slug"]
          },
        ]
      }
      probe_runs: {
        Row: {
          competitors_mentioned: string[]
          cost_usd: number | null
          created_at: string
          definition_id: string | null
          error: string | null
          evidence_type: string
          id: string
          idempotency_key: string | null
          latency_ms: number | null
          locale: string
          mentioned: boolean | null
          model: string
          model_version: string | null
          own_domain_cited: boolean | null
          presence_slug: string
          prompt_id: string
          prompt_version: string
          provider: string
          recommended: boolean | null
          region: string
          response_status: string
          result_summary: string | null
          retry_of: string | null
          tested_at: string
        }
        Insert: {
          competitors_mentioned?: string[]
          cost_usd?: number | null
          created_at?: string
          definition_id?: string | null
          error?: string | null
          evidence_type?: string
          id?: string
          idempotency_key?: string | null
          latency_ms?: number | null
          locale?: string
          mentioned?: boolean | null
          model: string
          model_version?: string | null
          own_domain_cited?: boolean | null
          presence_slug: string
          prompt_id: string
          prompt_version: string
          provider: string
          recommended?: boolean | null
          region?: string
          response_status: string
          result_summary?: string | null
          retry_of?: string | null
          tested_at?: string
        }
        Update: {
          competitors_mentioned?: string[]
          cost_usd?: number | null
          created_at?: string
          definition_id?: string | null
          error?: string | null
          evidence_type?: string
          id?: string
          idempotency_key?: string | null
          latency_ms?: number | null
          locale?: string
          mentioned?: boolean | null
          model?: string
          model_version?: string | null
          own_domain_cited?: boolean | null
          presence_slug?: string
          prompt_id?: string
          prompt_version?: string
          provider?: string
          recommended?: boolean | null
          region?: string
          response_status?: string
          result_summary?: string | null
          retry_of?: string | null
          tested_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "probe_runs_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "probe_definitions"
            referencedColumns: ["id"]
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
          version: number
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
          version?: number
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
          version?: number
        }
        Relationships: []
      }
      rate_events: {
        Row: {
          action: string
          created_at: string
          id: number
          subject_hash: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: never
          subject_hash: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: never
          subject_hash?: string
        }
        Relationships: []
      }
      rooms: {
        Row: {
          archived_at: string | null
          capacity: number
          color: string | null
          cover_path: string | null
          created_at: string
          description: string | null
          id: string
          kind: string
          organization_id: string | null
          owner_account_id: string | null
          retention_hours: number | null
          retention_images: number | null
          retention_texts: number | null
          room_number: number
          rules: string | null
          status: string
          title: string | null
          topic_id: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          archived_at?: string | null
          capacity?: number
          color?: string | null
          cover_path?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          organization_id?: string | null
          owner_account_id?: string | null
          retention_hours?: number | null
          retention_images?: number | null
          retention_texts?: number | null
          room_number: number
          rules?: string | null
          status?: string
          title?: string | null
          topic_id?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          archived_at?: string | null
          capacity?: number
          color?: string | null
          cover_path?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          organization_id?: string | null
          owner_account_id?: string | null
          retention_hours?: number | null
          retention_images?: number | null
          retention_texts?: number | null
          room_number?: number
          rules?: string | null
          status?: string
          title?: string | null
          topic_id?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_owner_account_id_fkey"
            columns: ["owner_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
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
      sponsored_campaigns: {
        Row: {
          cover_path: string | null
          created_at: string
          cta_label: string | null
          cta_url: string | null
          description: string
          ends_at: string | null
          id: string
          languages: string[]
          organization_id: string
          rejection_reason: string | null
          room_id: string | null
          safety_status: string
          starts_at: string | null
          status: string
          title: string
          topics: string[]
          updated_at: string
        }
        Insert: {
          cover_path?: string | null
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          description: string
          ends_at?: string | null
          id?: string
          languages?: string[]
          organization_id: string
          rejection_reason?: string | null
          room_id?: string | null
          safety_status?: string
          starts_at?: string | null
          status?: string
          title: string
          topics?: string[]
          updated_at?: string
        }
        Update: {
          cover_path?: string | null
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          description?: string
          ends_at?: string | null
          id?: string
          languages?: string[]
          organization_id?: string
          rejection_reason?: string | null
          room_id?: string | null
          safety_status?: string
          starts_at?: string | null
          status?: string
          title?: string
          topics?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsored_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsored_campaigns_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsored_placements: {
        Row: {
          active: boolean
          campaign_id: string
          created_at: string
          id: string
          surface: string
          topic_slug: string | null
          weight: number
        }
        Insert: {
          active?: boolean
          campaign_id: string
          created_at?: string
          id?: string
          surface?: string
          topic_slug?: string | null
          weight?: number
        }
        Update: {
          active?: boolean
          campaign_id?: string
          created_at?: string
          id?: string
          surface?: string
          topic_slug?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "sponsored_placements_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sponsored_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          account_id: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          grace_until: string | null
          id: string
          plan_id: string
          status: string
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          grace_until?: string | null
          id?: string
          plan_id: string
          status?: string
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          grace_until?: string | null
          id?: string
          plan_id?: string
          status?: string
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
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
      topic_aliases: {
        Row: {
          created_at: string
          id: string
          normalized_alias: string
          topic_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          normalized_alias: string
          topic_id: string
        }
        Update: {
          created_at?: string
          id?: string
          normalized_alias?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_aliases_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          enabled: boolean
          id: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          enabled?: boolean
          id?: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          enabled?: boolean
          id?: string
          slug?: string
        }
        Relationships: []
      }
      user_hidden_campaigns: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          subject_hash: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          subject_hash: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          subject_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_hidden_campaigns_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sponsored_campaigns"
            referencedColumns: ["id"]
          },
        ]
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
      webhook_events: {
        Row: {
          created_at: string
          external_id: string
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          type: string
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          type: string
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_expired: { Args: never; Returns: Json }
      enforce_all_retention: {
        Args: never
        Returns: {
          storage_path: string
        }[]
      }
      enforce_image_retention: {
        Args: { p_room_id: string }
        Returns: {
          storage_path: string
        }[]
      }
      enforce_text_retention: { Args: { p_room_id: string }; Returns: number }
      join_topic_room: {
        Args: { p_alias: string; p_subject_hash: string; p_topic_slug: string }
        Returns: Json
      }
      join_universal_room: {
        Args: { p_alias: string; p_subject_hash: string }
        Returns: Json
      }
      purge_dead_images: {
        Args: never
        Returns: {
          storage_path: string
        }[]
      }
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
