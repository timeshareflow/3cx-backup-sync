-- Add 'manager' to the user_tenants role check constraint
ALTER TABLE user_tenants DROP CONSTRAINT IF EXISTS user_tenants_role_check;
ALTER TABLE user_tenants ADD CONSTRAINT user_tenants_role_check
  CHECK ((role)::text = ANY ((ARRAY['admin'::character varying, 'manager'::character varying, 'user'::character varying])::text[]));
