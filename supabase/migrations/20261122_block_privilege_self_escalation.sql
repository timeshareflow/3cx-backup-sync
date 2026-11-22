-- Block privilege self-escalation through user_profiles.
--
-- Problem (verified 2026-11-22 with a rolled-back probe): the RLS policy
-- "Users can update own profile" lets any logged-in user UPDATE every column of their own
-- row, including `role`. With only their own session and the public anon key, a regular
-- user could PATCH /rest/v1/user_profiles?id=eq.<self> {"role":"super_admin"}. is_super_admin()
-- and the /api/admin/tenants route both trust that column, so the user would then be able
-- to create tenants and read every tenant's data.
--
-- Fix: a BEFORE UPDATE trigger that rejects changes to role, is_active, and is_protected when
-- the change comes from an end-user API role (anon / authenticated) and the caller is not a
-- super admin. Server code using the service-role key (admin invites, tenant creation, user
-- management routes) and direct database sessions (migrations, postgres) are unaffected.
-- Ordinary self-edits (name, avatar, phone, preferences, 2FA) keep working.
--
-- The function is deliberately SECURITY INVOKER (the default): inside it, current_user is the
-- caller's role. SECURITY DEFINER would make current_user the function owner and the check
-- would never fire.
--
-- Rollback: DROP TRIGGER trigger_prevent_privilege_self_escalation ON public.user_profiles;
--           DROP FUNCTION public.prevent_privilege_self_escalation();

CREATE OR REPLACE FUNCTION public.prevent_privilege_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND NOT public.is_super_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.is_active IS DISTINCT FROM OLD.is_active
       OR NEW.is_protected IS DISTINCT FROM OLD.is_protected THEN
      RAISE EXCEPTION 'Only a super admin can change role, active status, or protection'
        USING ERRCODE = '42501';  -- insufficient_privilege
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_prevent_privilege_self_escalation ON public.user_profiles;

CREATE TRIGGER trigger_prevent_privilege_self_escalation
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_privilege_self_escalation();
