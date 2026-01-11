-- Add retention policies table
-- Allows tenants to configure data retention settings for different data types
-- With option to disable deletion entirely (keep forever)

CREATE TABLE IF NOT EXISTS retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  data_type VARCHAR(50) NOT NULL, -- messages, media, recordings, voicemails, faxes, call_logs, meetings
  retention_days INTEGER, -- NULL = keep forever (no deletion)
  is_enabled BOOLEAN DEFAULT true,
  last_cleanup_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, data_type)
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_retention_policies_tenant
ON retention_policies(tenant_id);

CREATE INDEX IF NOT EXISTS idx_retention_policies_enabled
ON retention_policies(is_enabled, data_type);

-- Insert default retention policies for existing tenants (keep forever by default)
INSERT INTO retention_policies (tenant_id, data_type, retention_days, is_enabled)
SELECT t.id, dt.data_type, NULL, true
FROM tenants t
CROSS JOIN (
  VALUES
    ('messages'),
    ('media'),
    ('recordings'),
    ('voicemails'),
    ('faxes'),
    ('call_logs'),
    ('meetings')
) AS dt(data_type)
ON CONFLICT (tenant_id, data_type) DO NOTHING;

-- RLS Policies
ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;

-- Super admins and admins can view/edit retention policies for their tenant
CREATE POLICY "Admins can manage retention policies"
ON retention_policies
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_tenants ut
    JOIN user_profiles up ON ut.user_id = up.id
    WHERE ut.tenant_id = retention_policies.tenant_id
    AND up.auth_user_id = auth.uid()
    AND up.role IN ('super_admin', 'admin')
  )
);

-- Service role has full access
CREATE POLICY "Service role has full access to retention policies"
ON retention_policies
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Function to apply retention policies (called by scheduled job)
CREATE OR REPLACE FUNCTION apply_retention_policies()
RETURNS TABLE(
  tenant_id UUID,
  data_type VARCHAR(50),
  records_deleted BIGINT
) AS $$
DECLARE
  policy RECORD;
  deleted_count BIGINT;
  cutoff_date TIMESTAMPTZ;
BEGIN
  FOR policy IN
    SELECT rp.* FROM retention_policies rp
    WHERE rp.is_enabled = true
    AND rp.retention_days IS NOT NULL
    AND rp.retention_days > 0
  LOOP
    cutoff_date := NOW() - (policy.retention_days || ' days')::INTERVAL;
    deleted_count := 0;

    -- Delete old records based on data type
    CASE policy.data_type
      WHEN 'messages' THEN
        DELETE FROM messages m
        WHERE m.conversation_id IN (
          SELECT c.id FROM conversations c WHERE c.tenant_id = policy.tenant_id
        )
        AND m.sent_at < cutoff_date;
        GET DIAGNOSTICS deleted_count = ROW_COUNT;

      WHEN 'media' THEN
        DELETE FROM media_files mf
        WHERE mf.tenant_id = policy.tenant_id
        AND mf.created_at < cutoff_date;
        GET DIAGNOSTICS deleted_count = ROW_COUNT;

      WHEN 'recordings' THEN
        DELETE FROM call_recordings cr
        WHERE cr.tenant_id = policy.tenant_id
        AND cr.recorded_at < cutoff_date;
        GET DIAGNOSTICS deleted_count = ROW_COUNT;

      WHEN 'voicemails' THEN
        DELETE FROM voicemails v
        WHERE v.tenant_id = policy.tenant_id
        AND v.received_at < cutoff_date;
        GET DIAGNOSTICS deleted_count = ROW_COUNT;

      WHEN 'faxes' THEN
        DELETE FROM faxes f
        WHERE f.tenant_id = policy.tenant_id
        AND f.sent_received_at < cutoff_date;
        GET DIAGNOSTICS deleted_count = ROW_COUNT;

      WHEN 'call_logs' THEN
        DELETE FROM call_logs cl
        WHERE cl.tenant_id = policy.tenant_id
        AND cl.started_at < cutoff_date;
        GET DIAGNOSTICS deleted_count = ROW_COUNT;

      WHEN 'meetings' THEN
        DELETE FROM meeting_recordings mr
        WHERE mr.tenant_id = policy.tenant_id
        AND mr.recorded_at < cutoff_date;
        GET DIAGNOSTICS deleted_count = ROW_COUNT;

      ELSE
        deleted_count := 0;
    END CASE;

    -- Update last cleanup timestamp
    UPDATE retention_policies rp
    SET last_cleanup_at = NOW(), updated_at = NOW()
    WHERE rp.id = policy.id;

    -- Return results
    tenant_id := policy.tenant_id;
    data_type := policy.data_type;
    records_deleted := deleted_count;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
