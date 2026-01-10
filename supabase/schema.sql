-- 3CX Chat Archiver Database Schema
-- Run this in your Supabase SQL editor to create all tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CONVERSATIONS TABLE
-- ============================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  threecx_conversation_id VARCHAR(255) UNIQUE NOT NULL,
  conversation_name VARCHAR(255),
  is_external BOOLEAN DEFAULT FALSE,
  is_group_chat BOOLEAN DEFAULT FALSE,
  participant_count INTEGER DEFAULT 2,
  first_message_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);
CREATE INDEX idx_conversations_threecx_id ON conversations(threecx_conversation_id);

-- ============================================
-- PARTICIPANTS TABLE
-- ============================================
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  extension_number VARCHAR(50),
  display_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  participant_type VARCHAR(50) DEFAULT 'extension', -- 'extension', 'external', 'queue'
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(conversation_id, extension_number)
);

CREATE INDEX idx_participants_conversation ON participants(conversation_id);
CREATE INDEX idx_participants_extension ON participants(extension_number);

-- ============================================
-- MESSAGES TABLE
-- ============================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  threecx_message_id VARCHAR(255) UNIQUE,
  sender_extension VARCHAR(50),
  sender_name VARCHAR(255),
  message_text TEXT,
  message_type VARCHAR(50) DEFAULT 'text', -- 'text', 'image', 'video', 'file'
  has_media BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Full-text search vector
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE(message_text, '') || ' ' || COALESCE(sender_name, ''))
  ) STORED
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_sent_at ON messages(sent_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_extension);
CREATE INDEX idx_messages_search ON messages USING GIN(search_vector);
CREATE INDEX idx_messages_threecx_id ON messages(threecx_message_id);

-- ============================================
-- MEDIA FILES TABLE
-- ============================================
CREATE TABLE media_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  original_filename VARCHAR(255),
  stored_filename VARCHAR(255),
  file_type VARCHAR(50) DEFAULT 'document', -- 'image', 'video', 'document'
  mime_type VARCHAR(100),
  file_size_bytes BIGINT,
  s3_key VARCHAR(500) NOT NULL,
  s3_bucket VARCHAR(255) NOT NULL,
  thumbnail_s3_key VARCHAR(500),
  width INTEGER,
  height INTEGER,
  duration_seconds INTEGER,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(s3_key)
);

CREATE INDEX idx_media_message ON media_files(message_id);
CREATE INDEX idx_media_conversation ON media_files(conversation_id);

-- ============================================
-- EXTENSIONS TABLE
-- ============================================
CREATE TABLE extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_number VARCHAR(50) UNIQUE NOT NULL,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  display_name VARCHAR(255),
  email VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_extensions_number ON extensions(extension_number);

-- ============================================
-- SYNC STATUS TABLE
-- ============================================
CREATE TABLE sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type VARCHAR(50) NOT NULL UNIQUE, -- 'messages', 'media', 'extensions'
  last_sync_at TIMESTAMPTZ,
  last_successful_sync_at TIMESTAMPTZ,
  last_synced_message_id VARCHAR(255),
  last_synced_timestamp TIMESTAMPTZ,
  records_synced INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'idle', -- 'idle', 'running', 'success', 'error'
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize sync status records
INSERT INTO sync_status (sync_type, status) VALUES
  ('messages', 'idle'),
  ('media', 'idle'),
  ('extensions', 'idle')
ON CONFLICT (sync_type) DO NOTHING;

-- ============================================
-- SYNC LOGS TABLE
-- ============================================
CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type VARCHAR(50) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status VARCHAR(50), -- 'success', 'error', 'partial'
  messages_synced INTEGER DEFAULT 0,
  media_synced INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  error_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sync_logs_started ON sync_logs(started_at DESC);
CREATE INDEX idx_sync_logs_type ON sync_logs(sync_type);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to update conversation stats after message insert
CREATE OR REPLACE FUNCTION update_conversation_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET
    message_count = (
      SELECT COUNT(*) FROM messages WHERE conversation_id = NEW.conversation_id
    ),
    last_message_at = (
      SELECT MAX(sent_at) FROM messages WHERE conversation_id = NEW.conversation_id
    ),
    first_message_at = COALESCE(
      first_message_at,
      (SELECT MIN(sent_at) FROM messages WHERE conversation_id = NEW.conversation_id)
    ),
    updated_at = NOW()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update conversation stats on message insert
CREATE TRIGGER trigger_update_conversation_stats
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION update_conversation_stats();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER trigger_conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_extensions_updated_at
BEFORE UPDATE ON extensions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_sync_status_updated_at
BEFORE UPDATE ON sync_status
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Policies: Allow authenticated users to read all data
CREATE POLICY "Authenticated users can view conversations"
ON conversations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can view participants"
ON participants FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can view messages"
ON messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can view media_files"
ON media_files FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can view extensions"
ON extensions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can view sync_status"
ON sync_status FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can view sync_logs"
ON sync_logs FOR SELECT TO authenticated USING (true);

-- Service role policies (for sync service)
CREATE POLICY "Service role full access to conversations"
ON conversations FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to participants"
ON participants FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to messages"
ON messages FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to media_files"
ON media_files FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to extensions"
ON extensions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to sync_status"
ON sync_status FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to sync_logs"
ON sync_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================
-- VIEWS FOR CONVENIENCE
-- ============================================

-- View: Conversations with participant names
CREATE OR REPLACE VIEW conversations_with_participants AS
SELECT
  c.*,
  ARRAY_AGG(DISTINCT p.display_name) FILTER (WHERE p.display_name IS NOT NULL) as participant_names,
  ARRAY_AGG(DISTINCT p.extension_number) FILTER (WHERE p.extension_number IS NOT NULL) as extension_numbers
FROM conversations c
LEFT JOIN participants p ON p.conversation_id = c.id
GROUP BY c.id;

-- View: Messages with media
CREATE OR REPLACE VIEW messages_with_media AS
SELECT
  m.*,
  COALESCE(
    JSON_AGG(
      JSON_BUILD_OBJECT(
        'id', mf.id,
        's3_key', mf.s3_key,
        'file_type', mf.file_type,
        'mime_type', mf.mime_type,
        'original_filename', mf.original_filename
      )
    ) FILTER (WHERE mf.id IS NOT NULL),
    '[]'
  ) as media
FROM messages m
LEFT JOIN media_files mf ON mf.message_id = m.id
GROUP BY m.id;
