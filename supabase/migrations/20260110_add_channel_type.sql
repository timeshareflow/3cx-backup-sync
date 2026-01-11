-- Add channel_type column to conversations table
-- This allows distinguishing between different messaging channels:
-- internal (3CX internal chat), sms, mms, facebook, whatsapp, livechat, etc.

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS channel_type VARCHAR(50) DEFAULT 'internal';

-- Add index for filtering by channel type
CREATE INDEX IF NOT EXISTS idx_conversations_channel_type
ON conversations(tenant_id, channel_type);

-- Update existing conversations based on is_external flag
-- External conversations are likely SMS/external channels
UPDATE conversations
SET channel_type = 'external'
WHERE is_external = true AND channel_type = 'internal';
