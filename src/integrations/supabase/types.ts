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
      publish_intents: {
        Row: {
          billing_checkout_id: string | null
          billing_customer_id: string | null
          billing_subscription_id: string | null
          created_at: string
          current_period_end: string | null
          environment: string
          expires_at: string
          id: string
          intent_ref: string
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
          id?: string
          intent_ref: string
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
          id?: string
          intent_ref?: string
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
          billing_customer_id: string | null
          billing_subscription_id: string | null
          claim_token: string | null
          core: Json
          created_at: string
          current_period_end: string | null
          files: Json
          id: string
          intent_ref: string | null
          manage_secret_hash: string | null
          manage_secret_updated_at: string
          mode: string
          plan: string
          session_token: string | null
          slug: string
          status: string
          subscription_status: string | null
          unpublished_at: string | null
          updated_at: string
        }
        Insert: {
          billing_customer_id?: string | null
          billing_subscription_id?: string | null
          claim_token?: string | null
          core: Json
          created_at?: string
          current_period_end?: string | null
          files?: Json
          id?: string
          intent_ref?: string | null
          manage_secret_hash?: string | null
          manage_secret_updated_at?: string
          mode?: string
          plan?: string
          session_token?: string | null
          slug: string
          status?: string
          subscription_status?: string | null
          unpublished_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_customer_id?: string | null
          billing_subscription_id?: string | null
          claim_token?: string | null
          core?: Json
          created_at?: string
          current_period_end?: string | null
          files?: Json
          id?: string
          intent_ref?: string | null
          manage_secret_hash?: string | null
          manage_secret_updated_at?: string
          mode?: string
          plan?: string
          session_token?: string | null
          slug?: string
          status?: string
          subscription_status?: string | null
          unpublished_at?: string | null
          updated_at?: string
        }
        Relationships: []
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
