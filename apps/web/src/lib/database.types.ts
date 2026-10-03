/**
 * Supabase schema types.
 *
 * Hand-written to match supabase/migrations until a Supabase project is linked.
 * Regenerate after every migration with:
 *   supabase gen types typescript --local > apps/web/src/lib/database.types.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type AppRole = 'company_owner' | 'ceo' | 'hr_admin' | 'hr_staff' | 'manager' | 'employee';
type MemberStatus = 'invited' | 'active' | 'suspended';

export type Database = {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string;
          name_en: string;
          name_ar: string | null;
          logo_path: string | null;
          industry: string | null;
          country: string;
          timezone: string;
          weekend_days: number[];
          ft_daily_hours: number;
          pt_daily_hours: number;
          default_locale: string;
          plan: string;
          is_personal: boolean;
          onboarding_step: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          name_en?: string;
          name_ar?: string | null;
          logo_path?: string | null;
          industry?: string | null;
          country?: string;
          timezone?: string;
          weekend_days?: number[];
          ft_daily_hours?: number;
          pt_daily_hours?: number;
          default_locale?: string;
          onboarding_step?: string;
        };
        Relationships: [];
      };
      company_members: {
        Row: {
          id: string;
          company_id: string;
          user_id: string;
          role: AppRole;
          status: MemberStatus;
          invited_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          user_id: string;
          role?: AppRole;
          status?: MemberStatus;
          invited_by?: string | null;
        };
        Update: {
          role?: AppRole;
          status?: MemberStatus;
        };
        Relationships: [
          {
            foreignKeyName: 'company_members_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
        ];
      };
      permissions: {
        Row: { key: string; description: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      role_permissions: {
        Row: { role: AppRole; permission: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      user_permission_overrides: {
        Row: {
          company_id: string;
          user_id: string;
          permission: string;
          granted: boolean;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          company_id: string;
          user_id: string;
          permission: string;
          granted: boolean;
        };
        Update: { granted?: boolean };
        Relationships: [];
      };
      platform_admins: {
        Row: { user_id: string; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      activity_log: {
        Row: {
          id: string;
          company_id: string;
          user_id: string | null;
          action: 'insert' | 'update' | 'delete';
          entity: string;
          entity_id: string | null;
          diff: Json | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_company: {
        Args: { _name_en: string; _name_ar?: string | null; _is_personal?: boolean };
        Returns: string;
      };
      my_permissions: { Args: { _company_id: string }; Returns: string[] };
      has_permission: { Args: { _company_id: string; _perm: string }; Returns: boolean };
      is_member: { Args: { _company_id: string }; Returns: boolean };
      company_role: { Args: { _company_id: string }; Returns: AppRole | null };
      is_platform_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: {
      app_role: AppRole;
      member_status: MemberStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
