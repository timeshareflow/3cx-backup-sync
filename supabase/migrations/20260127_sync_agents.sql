-- Sync Agents table for tracking installed agents on customer 3CX servers
CREATE TABLE IF NOT EXISTS sync_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Agent identification
    hostname VARCHAR(255),
    ip_address VARCHAR(45),
    os_info TEXT,
    agent_version VARCHAR(20),
    install_path TEXT,

    -- Authentication
    agent_token VARCHAR(64) NOT NULL UNIQUE,

    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- pending, active, inactive, error
    last_heartbeat_at TIMESTAMPTZ,
    last_sync_at TIMESTAMPTZ,
    last_error TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Indexes
    UNIQUE(tenant_id) -- One agent per tenant
);

-- Index for heartbeat checks
CREATE INDEX IF NOT EXISTS idx_sync_agents_heartbeat ON sync_agents(status, last_heartbeat_at);

-- RLS policies
ALTER TABLE sync_agents ENABLE ROW LEVEL SECURITY;

-- Super admins can see all agents
CREATE POLICY "Super admins can view all agents" ON sync_agents
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'super_admin'
        )
    );

-- Admins can view their tenant's agent
CREATE POLICY "Admins can view own tenant agent" ON sync_agents
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.tenant_id = sync_agents.tenant_id
            AND user_profiles.role = 'admin'
        )
    );

-- Service role has full access (for agent registration/updates)
CREATE POLICY "Service role has full access to agents" ON sync_agents
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Add agent_token column to tenants for generating install commands
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS agent_token VARCHAR(64);

-- Generate tokens for existing tenants
UPDATE tenants SET agent_token = encode(gen_random_bytes(32), 'hex') WHERE agent_token IS NULL;

COMMENT ON TABLE sync_agents IS 'Tracks installed sync agents on customer 3CX servers';
COMMENT ON COLUMN sync_agents.agent_token IS 'Secret token used by agent to authenticate with API';
COMMENT ON COLUMN tenants.agent_token IS 'Token for installing/authenticating sync agent';
