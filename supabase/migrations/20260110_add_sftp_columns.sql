-- Add SFTP connection columns for remote file access
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS sftp_host varchar(255),
ADD COLUMN IF NOT EXISTS sftp_port integer DEFAULT 22,
ADD COLUMN IF NOT EXISTS sftp_user varchar(100),
ADD COLUMN IF NOT EXISTS sftp_password text;

-- Update default for threecx_user to match 3CX convention
ALTER TABLE tenants
ALTER COLUMN threecx_user SET DEFAULT 'phonesystem';
