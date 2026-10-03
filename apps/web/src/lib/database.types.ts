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
type EmploymentType = 'FT' | 'PT';
type EmployeeStatus = 'active' | 'inactive';

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
      company_holidays: {
        Row: {
          id: string;
          company_id: string;
          holiday_date: string;
          name_en: string;
          name_ar: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          holiday_date: string;
          name_en: string;
          name_ar?: string | null;
        };
        Update: { holiday_date?: string; name_en?: string; name_ar?: string | null };
        Relationships: [];
      };
      departments: {
        Row: {
          id: string;
          company_id: string;
          name_en: string;
          name_ar: string | null;
          head_position_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name_en: string;
          name_ar?: string | null;
          head_position_id?: string | null;
        };
        Update: { name_en?: string; name_ar?: string | null; head_position_id?: string | null };
        Relationships: [];
      };
      positions: {
        Row: {
          id: string;
          company_id: string;
          department_id: string | null;
          title_en: string;
          title_ar: string | null;
          reports_to_position_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          department_id?: string | null;
          title_en: string;
          title_ar?: string | null;
          reports_to_position_id?: string | null;
        };
        Update: {
          department_id?: string | null;
          title_en?: string;
          title_ar?: string | null;
          reports_to_position_id?: string | null;
        };
        Relationships: [];
      };
      employees: {
        Row: {
          id: string;
          company_id: string;
          code: string;
          full_name: string;
          work_email: string | null;
          position_id: string | null;
          department_id: string | null;
          manager_employee_id: string | null;
          user_id: string | null;
          employment_type: EmploymentType;
          start_date: string | null;
          status: EmployeeStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          code: string;
          full_name: string;
          work_email?: string | null;
          position_id?: string | null;
          department_id?: string | null;
          manager_employee_id?: string | null;
          employment_type?: EmploymentType;
          start_date?: string | null;
          status?: EmployeeStatus;
        };
        Update: {
          code?: string;
          full_name?: string;
          work_email?: string | null;
          position_id?: string | null;
          department_id?: string | null;
          manager_employee_id?: string | null;
          employment_type?: EmploymentType;
          start_date?: string | null;
          status?: EmployeeStatus;
        };
        Relationships: [];
      };
      employee_visibility: {
        Row: { company_id: string; viewer_user_id: string; employee_id: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      company_invitations: {
        Row: {
          id: string;
          company_id: string;
          email: string;
          role: AppRole;
          employee_id: string | null;
          invited_by: string | null;
          created_at: string;
          expires_at: string;
          accepted_at: string | null;
          accepted_by: string | null;
          revoked_at: string | null;
        };
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
      can_view_employee: { Args: { _employee_id: string }; Returns: boolean };
      create_invitation: {
        Args: { _company_id: string; _email: string; _role: AppRole; _employee_id?: string | null };
        Returns: string;
      };
      revoke_invitation: { Args: { _invitation_id: string }; Returns: undefined };
      accept_invitation: { Args: { _invitation_id: string }; Returns: string };
      my_invitations: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          company_id: string;
          company_name_en: string;
          company_name_ar: string | null;
          role: AppRole;
          expires_at: string;
        }[];
      };
      list_company_members: {
        Args: { _company_id: string };
        Returns: {
          user_id: string;
          email: string;
          full_name: string | null;
          role: AppRole;
          status: MemberStatus;
          created_at: string;
          last_sign_in_at: string | null;
        }[];
      };
      import_org: { Args: { _company_id: string; _payload: Json }; Returns: Json };
    };
    Enums: {
      app_role: AppRole;
      member_status: MemberStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
