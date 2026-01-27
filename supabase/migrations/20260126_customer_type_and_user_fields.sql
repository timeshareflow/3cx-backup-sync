-- Add customer type to tenants (standard or business)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS customer_type VARCHAR(20) DEFAULT 'standard';

-- Add business-specific fields to tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_name VARCHAR(255);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_address TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_phone VARCHAR(50);

-- Update user_profiles to have first_name and last_name (in addition to full_name for backwards compatibility)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS first_name VARCHAR(255);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_name VARCHAR(255);

-- Add address and phone to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

-- Migrate existing full_name data to first_name and last_name if possible
UPDATE user_profiles
SET
  first_name = SPLIT_PART(full_name, ' ', 1),
  last_name = CASE
    WHEN POSITION(' ' IN full_name) > 0
    THEN SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1)
    ELSE ''
  END
WHERE full_name IS NOT NULL AND first_name IS NULL;

-- Create index on customer_type for faster filtering
CREATE INDEX IF NOT EXISTS idx_tenants_customer_type ON tenants(customer_type);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
