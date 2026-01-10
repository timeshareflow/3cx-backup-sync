-- 3CX BackupWiz - Super Admin Setup
-- Run this AFTER creating the user in Supabase Auth Dashboard
--
-- Steps:
-- 1. Go to Supabase Dashboard > Authentication > Users > "Add user"
-- 2. Enter your email and password
-- 3. Click "Create user"
-- 4. Run this SQL script in Supabase SQL Editor

-- Insert or update the super admin profile
-- CHANGE THE EMAIL BELOW TO YOUR EMAIL
INSERT INTO user_profiles (id, email, role, is_protected, is_active)
SELECT id, email, 'super_admin', TRUE, TRUE
FROM auth.users
WHERE email = 'allendalecompanies@gmail.com'  -- CHANGE THIS EMAIL
ON CONFLICT (id) DO UPDATE SET
  role = 'super_admin',
  is_protected = TRUE,
  is_active = TRUE;

-- Verify the setup
SELECT id, email, role, is_protected, is_active FROM user_profiles WHERE role = 'super_admin';
