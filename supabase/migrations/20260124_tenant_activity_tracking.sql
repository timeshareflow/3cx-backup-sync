-- Add user activity tracking to tenants table
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS last_user_activity_at TIMESTAMPTZ;

-- Create index for efficient activity queries
CREATE INDEX IF NOT EXISTS idx_tenants_last_activity
ON tenants(last_user_activity_at)
WHERE last_user_activity_at IS NOT NULL;

-- Add comment
COMMENT ON COLUMN tenants.last_user_activity_at IS 'Timestamp of last user activity - used to determine sync frequency';
