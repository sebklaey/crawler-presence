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
      ad_creatives: {
        Row: {
          approved_content_hash: string | null
          body: string
          call_to_action: string | null
          campaign_id: string
          content_version_hash: string | null
          created_at: string
          destination_domain: string
          destination_url: string
          ends_at: string | null
          headline: string
          id: string
          image_alt: string | null
          image_reference: string | null
          knowledge_slug: string | null
          languages: string[]
          product_category: string | null
          product_description: string | null
          product_name: string
          product_reference: string | null
          starts_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_content_hash?: string | null
          body: string
          call_to_action?: string | null
          campaign_id: string
          content_version_hash?: string | null
          created_at?: string
          destination_domain: string
          destination_url: string
          ends_at?: string | null
          headline: string
          id?: string
          image_alt?: string | null
          image_reference?: string | null
          knowledge_slug?: string | null
          languages?: string[]
          product_category?: string | null
          product_description?: string | null
          product_name: string
          product_reference?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_content_hash?: string | null
          body?: string
          call_to_action?: string | null
          campaign_id?: string
          content_version_hash?: string | null
          created_at?: string
          destination_domain?: string
          destination_url?: string
          ends_at?: string | null
          headline?: string
          id?: string
          image_alt?: string | null
          image_reference?: string | null
          knowledge_slug?: string | null
          languages?: string[]
          product_category?: string | null
          product_description?: string | null
          product_name?: string
          product_reference?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_creatives_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sponsored_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_resonance_patterns: {
        Row: {
          content_version_hash: string | null
          created_at: string
          created_from_approved_content: boolean
          creative_id: string
          dimensions: Json
          id: string
          intents: string[]
          invalidated_at: string | null
          languages: string[]
          schema_version: string
          version: number
        }
        Insert: {
          content_version_hash?: string | null
          created_at?: string
          created_from_approved_content?: boolean
          creative_id: string
          dimensions?: Json
          id?: string
          intents?: string[]
          invalidated_at?: string | null
          languages?: string[]
          schema_version?: string
          version?: number
        }
        Update: {
          content_version_hash?: string | null
          created_at?: string
          created_from_approved_content?: boolean
          creative_id?: string
          dimensions?: Json
          id?: string
          intents?: string[]
          invalidated_at?: string | null
          languages?: string[]
          schema_version?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ad_resonance_patterns_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "ad_creatives"
            referencedColumns: ["id"]
          },
        ]
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
          handle: string | null
          last_seen_at: string
          subject_hash: string
        }
        Insert: {
          account_id?: string | null
          custom_alias?: string | null
          first_seen_at?: string
          handle?: string | null
          last_seen_at?: string
          subject_hash: string
        }
        Update: {
          account_id?: string | null
          custom_alias?: string | null
          first_seen_at?: string
          handle?: string | null
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
      blocked_advertisers: {
        Row: {
          created_at: string
          organization_id: string
          subject_hash: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          subject_hash: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          subject_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_advertisers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          creative_id: string | null
          decision: string
          id: string
          reason: string | null
          reviewer_account_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          creative_id?: string | null
          decision: string
          id?: string
          reason?: string | null
          reviewer_account_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          creative_id?: string | null
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
      content_likes: {
        Row: {
          created_at: string
          id: string
          owner_subject_hash: string
          room_id: string | null
          subject_hash: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_subject_hash: string
          room_id?: string | null
          subject_hash: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_subject_hash?: string
          room_id?: string | null
          subject_hash?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_likes_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
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
      handle_redirects: {
        Row: {
          created_at: string
          old_handle: string
          owner_subject_hash: string
          room_id: string
        }
        Insert: {
          created_at?: string
          old_handle: string
          owner_subject_hash: string
          room_id: string
        }
        Update: {
          created_at?: string
          old_handle?: string
          owner_subject_hash?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "handle_redirects_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
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
      match_events: {
        Row: {
          created_at: string
          event_type: string
          id: number
          metadata: Json
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: number
          metadata?: Json
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: number
          metadata?: Json
        }
        Relationships: []
      }
      match_requests: {
        Row: {
          candidate_pattern_id: string
          candidate_status: string
          created_at: string
          expires_at: string
          id: string
          public_match_id: string
          requester_pattern_id: string
          requester_status: string
          resolved_at: string | null
          room_id: string | null
          safe_reasons: Json
          score: number
          state: string
          updated_at: string
        }
        Insert: {
          candidate_pattern_id: string
          candidate_status?: string
          created_at?: string
          expires_at?: string
          id?: string
          public_match_id: string
          requester_pattern_id: string
          requester_status?: string
          resolved_at?: string | null
          room_id?: string | null
          safe_reasons?: Json
          score?: number
          state?: string
          updated_at?: string
        }
        Update: {
          candidate_pattern_id?: string
          candidate_status?: string
          created_at?: string
          expires_at?: string
          id?: string
          public_match_id?: string
          requester_pattern_id?: string
          requester_status?: string
          resolved_at?: string | null
          room_id?: string | null
          safe_reasons?: Json
          score?: number
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_requests_candidate_pattern_id_fkey"
            columns: ["candidate_pattern_id"]
            isOneToOne: false
            referencedRelation: "resonance_patterns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_requests_requester_pattern_id_fkey"
            columns: ["requester_pattern_id"]
            isOneToOne: false
            referencedRelation: "resonance_patterns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_requests_room_id_fkey"
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
      notification_settings: {
        Row: {
          live_event: boolean
          new_conversation: boolean
          new_follower: boolean
          public_message: boolean
          subject_hash: string
          updated_at: string
        }
        Insert: {
          live_event?: boolean
          new_conversation?: boolean
          new_follower?: boolean
          public_message?: boolean
          subject_hash: string
          updated_at?: string
        }
        Update: {
          live_event?: boolean
          new_conversation?: boolean
          new_follower?: boolean
          public_message?: boolean
          subject_hash?: string
          updated_at?: string
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
      profile_blocks: {
        Row: {
          blocked_subject_hash: string
          created_at: string
          id: string
          reason: string | null
          subject_hash: string
        }
        Insert: {
          blocked_subject_hash: string
          created_at?: string
          id?: string
          reason?: string | null
          subject_hash: string
        }
        Update: {
          blocked_subject_hash?: string
          created_at?: string
          id?: string
          reason?: string | null
          subject_hash?: string
        }
        Relationships: []
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
      resonance_ad_preferences: {
        Row: {
          consented_at: string | null
          enabled: boolean
          internal_session_reference: string
          updated_at: string
        }
        Insert: {
          consented_at?: string | null
          enabled?: boolean
          internal_session_reference: string
          updated_at?: string
        }
        Update: {
          consented_at?: string | null
          enabled?: boolean
          internal_session_reference?: string
          updated_at?: string
        }
        Relationships: []
      }
      resonance_patterns: {
        Row: {
          anonymous_pattern_id: string
          broad_region: string | null
          connection_modes: string[]
          created_at: string
          deleted_at: string | null
          dimensions: Json
          expires_at: string
          id: string
          intent: string
          languages: string[]
          resonance_signature: string | null
          schema_version: string
          status: string
          subject_hash: string
          updated_at: string
        }
        Insert: {
          anonymous_pattern_id: string
          broad_region?: string | null
          connection_modes?: string[]
          created_at?: string
          deleted_at?: string | null
          dimensions?: Json
          expires_at?: string
          id?: string
          intent: string
          languages?: string[]
          resonance_signature?: string | null
          schema_version?: string
          status?: string
          subject_hash: string
          updated_at?: string
        }
        Update: {
          anonymous_pattern_id?: string
          broad_region?: string | null
          connection_modes?: string[]
          created_at?: string
          deleted_at?: string | null
          dimensions?: Json
          expires_at?: string
          id?: string
          intent?: string
          languages?: string[]
          resonance_signature?: string | null
          schema_version?: string
          status?: string
          subject_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      room_analytics_events: {
        Row: {
          actor_hash: string | null
          created_at: string
          event_type: string
          id: number
          metadata: Json
          owner_subject_hash: string
          room_id: string
        }
        Insert: {
          actor_hash?: string | null
          created_at?: string
          event_type: string
          id?: never
          metadata?: Json
          owner_subject_hash: string
          room_id: string
        }
        Update: {
          actor_hash?: string | null
          created_at?: string
          event_type?: string
          id?: never
          metadata?: Json
          owner_subject_hash?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_analytics_events_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_followers: {
        Row: {
          created_at: string
          follower_subject_hash: string
          id: string
          room_id: string
        }
        Insert: {
          created_at?: string
          follower_subject_hash: string
          id?: string
          room_id: string
        }
        Update: {
          created_at?: string
          follower_subject_hash?: string
          id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_followers_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_notifications: {
        Row: {
          created_at: string
          id: number
          message: string
          notification_type: string
          read: boolean
          recipient_subject_hash: string
          room_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          message: string
          notification_type: string
          read?: boolean
          recipient_subject_hash: string
          room_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          message?: string
          notification_type?: string
          read?: boolean
          recipient_subject_hash?: string
          room_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_notifications_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_participants: {
        Row: {
          can_write: boolean
          id: string
          joined_at: string
          left_at: string | null
          public_handle: string | null
          role: string
          room_id: string
          subject_hash: string
        }
        Insert: {
          can_write?: boolean
          id?: string
          joined_at?: string
          left_at?: string | null
          public_handle?: string | null
          role?: string
          room_id: string
          subject_hash: string
        }
        Update: {
          can_write?: boolean
          id?: string
          joined_at?: string
          left_at?: string | null
          public_handle?: string | null
          role?: string
          room_id?: string
          subject_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_plan_links: {
        Row: {
          linked_at: string
          plan: string
          presence_slug: string
          subject_hash: string
          updated_at: string
        }
        Insert: {
          linked_at?: string
          plan: string
          presence_slug: string
          subject_hash: string
          updated_at?: string
        }
        Update: {
          linked_at?: string
          plan?: string
          presence_slug?: string
          subject_hash?: string
          updated_at?: string
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
          legacy_private: boolean
          organization_id: string | null
          owner_account_id: string | null
          public_slug: string | null
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
          legacy_private?: boolean
          organization_id?: string | null
          owner_account_id?: string | null
          public_slug?: string | null
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
          legacy_private?: boolean
          organization_id?: string | null
          owner_account_id?: string | null
          public_slug?: string | null
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
      social_posts: {
        Row: {
          canonical_url: string
          contains_sensitive_contact: boolean
          created_at: string
          display_handle: string | null
          expires_at: string
          id: string
          idempotency_key: string | null
          is_identity_verified: boolean
          preview_status: string
          provider_id: string
          provider_label: string
          room_kind: string
          room_ref: string | null
          subject_hash: string
        }
        Insert: {
          canonical_url: string
          contains_sensitive_contact?: boolean
          created_at?: string
          display_handle?: string | null
          expires_at?: string
          id?: string
          idempotency_key?: string | null
          is_identity_verified?: boolean
          preview_status?: string
          provider_id: string
          provider_label: string
          room_kind: string
          room_ref?: string | null
          subject_hash: string
        }
        Update: {
          canonical_url?: string
          contains_sensitive_contact?: boolean
          created_at?: string
          display_handle?: string | null
          expires_at?: string
          id?: string
          idempotency_key?: string | null
          is_identity_verified?: boolean
          preview_status?: string
          provider_id?: string
          provider_label?: string
          room_kind?: string
          room_ref?: string | null
          subject_hash?: string
        }
        Relationships: []
      }
      social_preview_cache: {
        Row: {
          expires_at: string
          fetched_at: string
          normalized_url_hash: string
          preview_status: string
          provider_id: string
          safe_avatar_proxy_url: string | null
          safe_description: string | null
          safe_title: string | null
        }
        Insert: {
          expires_at?: string
          fetched_at?: string
          normalized_url_hash: string
          preview_status?: string
          provider_id: string
          safe_avatar_proxy_url?: string | null
          safe_description?: string | null
          safe_title?: string | null
        }
        Update: {
          expires_at?: string
          fetched_at?: string
          normalized_url_hash?: string
          preview_status?: string
          provider_id?: string
          safe_avatar_proxy_url?: string | null
          safe_description?: string | null
          safe_title?: string | null
        }
        Relationships: []
      }
      social_provider_registry: {
        Row: {
          aliases: string[]
          canonical_hosts: string[]
          category: string
          created_at: string
          display_name: string
          enabled: boolean
          handle_pattern: string | null
          icon_key: string | null
          id: string
          preview_strategy: string
          profile_url_template: string | null
          sensitive_identifier: boolean
          supports_direct_url: boolean
          supports_handle: boolean
          supports_public_preview: boolean
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          canonical_hosts?: string[]
          category?: string
          created_at?: string
          display_name: string
          enabled?: boolean
          handle_pattern?: string | null
          icon_key?: string | null
          id: string
          preview_strategy?: string
          profile_url_template?: string | null
          sensitive_identifier?: boolean
          supports_direct_url?: boolean
          supports_handle?: boolean
          supports_public_preview?: boolean
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          canonical_hosts?: string[]
          category?: string
          created_at?: string
          display_name?: string
          enabled?: boolean
          handle_pattern?: string | null
          icon_key?: string | null
          id?: string
          preview_strategy?: string
          profile_url_template?: string | null
          sensitive_identifier?: boolean
          supports_direct_url?: boolean
          supports_handle?: boolean
          supports_public_preview?: boolean
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
      sponsored_impressions: {
        Row: {
          anonymous_frequency_key: string
          clicked_at: string | null
          creative_id: string
          displayed_at: string
          hidden_at: string | null
          id: number
          language: string | null
          placement_context: string
          reported_at: string | null
          resonance_bucket: string | null
        }
        Insert: {
          anonymous_frequency_key: string
          clicked_at?: string | null
          creative_id: string
          displayed_at?: string
          hidden_at?: string | null
          id?: number
          language?: string | null
          placement_context?: string
          reported_at?: string | null
          resonance_bucket?: string | null
        }
        Update: {
          anonymous_frequency_key?: string
          clicked_at?: string | null
          creative_id?: string
          displayed_at?: string
          hidden_at?: string | null
          id?: number
          language?: string | null
          placement_context?: string
          reported_at?: string | null
          resonance_bucket?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsored_impressions_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "ad_creatives"
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
      sugar_accounts: {
        Row: {
          balance: number
          created_at: string
          current_lease_expires_at: string | null
          daily_minted_amount: number
          daily_window_started_at: string
          frozen_at: string | null
          id: string
          last_qualified_activity_at: string | null
          lifetime_burned_from_gifts: number
          lifetime_minted: number
          lifetime_received: number
          lifetime_sent: number
          mining_remainder_seconds: number
          mining_status: string
          public_account_reference: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          current_lease_expires_at?: string | null
          daily_minted_amount?: number
          daily_window_started_at?: string
          frozen_at?: string | null
          id?: string
          last_qualified_activity_at?: string | null
          lifetime_burned_from_gifts?: number
          lifetime_minted?: number
          lifetime_received?: number
          lifetime_sent?: number
          mining_remainder_seconds?: number
          mining_status?: string
          public_account_reference?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          current_lease_expires_at?: string | null
          daily_minted_amount?: number
          daily_window_started_at?: string
          frozen_at?: string | null
          id?: string
          last_qualified_activity_at?: string | null
          lifetime_burned_from_gifts?: number
          lifetime_minted?: number
          lifetime_received?: number
          lifetime_sent?: number
          mining_remainder_seconds?: number
          mining_status?: string
          public_account_reference?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sugar_global_state: {
        Row: {
          current_supply: number
          latest_event_hash: string
          latest_sequence_number: number
          lifetime_burned: number
          lifetime_minted: number
          maximum_supply: number
          singleton_id: number
          updated_at: string
        }
        Insert: {
          current_supply?: number
          latest_event_hash?: string
          latest_sequence_number?: number
          lifetime_burned?: number
          lifetime_minted?: number
          maximum_supply?: number
          singleton_id?: number
          updated_at?: string
        }
        Update: {
          current_supply?: number
          latest_event_hash?: string
          latest_sequence_number?: number
          lifetime_burned?: number
          lifetime_minted?: number
          maximum_supply?: number
          singleton_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      sugar_ledger_events: {
        Row: {
          account_id: string
          amount: number
          counterparty_account_id: string | null
          created_at: string
          event_hash: string
          event_id: string
          event_type: string
          metadata: Json
          previous_hash: string
          sequence_number: number
          server_signature: string
          transfer_group_id: string | null
        }
        Insert: {
          account_id: string
          amount?: number
          counterparty_account_id?: string | null
          created_at?: string
          event_hash: string
          event_id?: string
          event_type: string
          metadata?: Json
          previous_hash: string
          sequence_number: number
          server_signature: string
          transfer_group_id?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          counterparty_account_id?: string | null
          created_at?: string
          event_hash?: string
          event_id?: string
          event_type?: string
          metadata?: Json
          previous_hash?: string
          sequence_number?: number
          server_signature?: string
          transfer_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sugar_ledger_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "sugar_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sugar_ledger_events_counterparty_account_id_fkey"
            columns: ["counterparty_account_id"]
            isOneToOne: false
            referencedRelation: "sugar_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      sugar_mining_leases: {
        Row: {
          account_id: string
          created_at: string
          expires_at: string
          id: string
          qualified_seconds: number
          source_action: string
          started_at: string
          status: string
        }
        Insert: {
          account_id: string
          created_at?: string
          expires_at: string
          id?: string
          qualified_seconds?: number
          source_action: string
          started_at?: string
          status?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          qualified_seconds?: number
          source_action?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sugar_mining_leases_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "sugar_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      sugar_transfers: {
        Row: {
          burned_amount: number
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string
          recipient_account_id: string
          recipient_amount: number
          requested_amount: number
          sender_account_id: string
          status: string
        }
        Insert: {
          burned_amount: number
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          recipient_account_id: string
          recipient_amount: number
          requested_amount: number
          sender_account_id: string
          status?: string
        }
        Update: {
          burned_amount?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          recipient_account_id?: string
          recipient_amount?: number
          requested_amount?: number
          sender_account_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sugar_transfers_recipient_account_id_fkey"
            columns: ["recipient_account_id"]
            isOneToOne: false
            referencedRelation: "sugar_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sugar_transfers_sender_account_id_fkey"
            columns: ["sender_account_id"]
            isOneToOne: false
            referencedRelation: "sugar_accounts"
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
      user_rooms: {
        Row: {
          avatar_path: string | null
          banner_path: string | null
          created_at: string
          description: string | null
          external_url: string | null
          handle: string
          id: string
          location: string | null
          owner_subject_hash: string
          profile_visibility: string
          room_id: string
          room_name: string
          show_follower_count: boolean
          show_likes: boolean
          show_online_status: boolean
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          banner_path?: string | null
          created_at?: string
          description?: string | null
          external_url?: string | null
          handle: string
          id?: string
          location?: string | null
          owner_subject_hash: string
          profile_visibility?: string
          room_id: string
          room_name: string
          show_follower_count?: boolean
          show_likes?: boolean
          show_online_status?: boolean
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          banner_path?: string | null
          created_at?: string
          description?: string | null
          external_url?: string | null
          handle?: string
          id?: string
          location?: string | null
          owner_subject_hash?: string
          profile_visibility?: string
          room_id?: string
          room_name?: string
          show_follower_count?: boolean
          show_likes?: boolean
          show_online_status?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_rooms_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
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
      room_presence: {
        Row: {
          alias: string | null
          joined_at: string | null
          last_seen_at: string | null
          presence_status: string | null
          room_id: string | null
          user_id: string | null
        }
        Insert: {
          alias?: string | null
          joined_at?: string | null
          last_seen_at?: string | null
          presence_status?: never
          room_id?: string | null
          user_id?: string | null
        }
        Update: {
          alias?: string | null
          joined_at?: string | null
          last_seen_at?: string | null
          presence_status?: never
          room_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
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
      get_or_create_personal_room: {
        Args: { p_handle: string; p_room_name: string; p_subject_hash: string }
        Returns: Json
      }
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
      sugar_activity: {
        Args: {
          p_activity_window_seconds: number
          p_daily_cap: number
          p_lease_seconds: number
          p_min_age_hours: number
          p_minutes_per_unit: number
          p_signing_key: string
          p_source_action: string
          p_user_key: string
        }
        Returns: Json
      }
      sugar_admin_set_frozen: {
        Args: { p_frozen: boolean; p_signing_key: string; p_user_key: string }
        Returns: Json
      }
      sugar_append_event: {
        Args: {
          p_account: string
          p_amount: number
          p_counterparty: string
          p_group: string
          p_metadata: Json
          p_signing_key: string
          p_type: string
        }
        Returns: number
      }
      sugar_ensure_account: {
        Args: { p_user_key: string }
        Returns: {
          balance: number
          created_at: string
          current_lease_expires_at: string | null
          daily_minted_amount: number
          daily_window_started_at: string
          frozen_at: string | null
          id: string
          last_qualified_activity_at: string | null
          lifetime_burned_from_gifts: number
          lifetime_minted: number
          lifetime_received: number
          lifetime_sent: number
          mining_remainder_seconds: number
          mining_status: string
          public_account_reference: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "sugar_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sugar_transfer: {
        Args: {
          p_amount: number
          p_idempotency_key: string
          p_recipient_key: string
          p_sender_key: string
          p_signing_key: string
        }
        Returns: Json
      }
      sugar_verify_ledger: {
        Args: { p_limit?: number; p_signing_key: string }
        Returns: Json
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
