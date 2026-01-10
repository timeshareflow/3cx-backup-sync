-- 3CX Chat Archiver - Super Admin Setup
-- Run this AFTER creating the user in Supabase Auth Dashboard
--
-- Steps:
-- 1. Go to Supabase Dashboard > Authentication > Users > "Add user"
-- 2. Enter email: allendalecompanies@gmail.com
-- 3. Enter your password
-- 4. Click "Create user"
-- 5. Run this SQL script in Supabase SQL Editor

-- Make the user a protected super admin
UPDATE user_profiles
SET
  role = 'super_admin',
  is_protected = TRUE,
  is_active = TRUE
WHERE email = 'allendalecompanies@gmail.com';

-- Verify the setup
SELECT
  id,
  email,
  role,
  is_protected,
  is_active,
  created_at
FROM user_profiles
WHERE email = 'allendalecompanies@gmail.com';
