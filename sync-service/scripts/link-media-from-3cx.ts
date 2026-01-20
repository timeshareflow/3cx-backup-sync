/**
 * Link Media Files from 3CX Database
 *
 * This script queries the 3CX database for file mappings (hash -> original filename)
 * and updates our media_files records with the correct message_id and original filename.
 */

import dotenv from "dotenv";
import { Pool } from "pg";
import * as net from "net";
import { Client as SshClient } from "ssh2";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface FileMapping {
  threecx_message_id: string;
  internal_file_name: string;
  public_file_name: string;
  file_info: {
    HasPreview?: boolean;
    FileType?: number;
    Width?: number;
    Height?: number;
    Size?: number;
  } | null;
}

async function createSshTunnel(config: {
  sshHost: string;
  sshPort: number;
  sshUser: string;
  sshPassword: string;
  dbHost: string;
  dbPort: number;
  localPort: number;
}): Promise<{ server: net.Server; close: () => void }> {
  return new Promise((resolve, reject) => {
    const sshClient = new SshClient();

    sshClient.on("ready", () => {
      const server = net.createServer((sock) => {
        sshClient.forwardOut(
          sock.remoteAddress || "127.0.0.1",
          sock.remotePort || 0,
          config.dbHost,
          config.dbPort,
          (err, stream) => {
            if (err) {
              sock.end();
              return;
            }
            sock.pipe(stream).pipe(sock);
          }
        );
      });

      server.listen(config.localPort, "127.0.0.1", () => {
        resolve({
          server,
          close: () => {
            server.close();
            sshClient.end();
          },
        });
      });
    });

    sshClient.on("error", reject);

    sshClient.connect({
      host: config.sshHost,
      port: config.sshPort,
      username: config.sshUser,
      password: config.sshPassword,
    });
  });
}

async function getFileMappingsFrom3CX(pool: Pool): Promise<FileMapping[]> {
  const client = await pool.connect();

  try {
    const result = await client.query(`
      SELECT
        id_message::text as threecx_message_id,
        internal_file_name,
        public_file_name,
        file_info
      FROM chat_message
      WHERE internal_file_name IS NOT NULL
      ORDER BY id_message DESC
    `);

    return result.rows.map((row) => ({
      threecx_message_id: row.threecx_message_id,
      internal_file_name: row.internal_file_name,
      public_file_name: row.public_file_name,
      file_info: row.file_info ? JSON.parse(row.file_info) : null,
    }));
  } finally {
    client.release();
  }
}

async function linkMediaForTenant(tenantId: string, tenantName: string, pool: Pool): Promise<void> {
  console.log(`\nProcessing tenant: ${tenantName}`);

  // Get file mappings from 3CX
  const fileMappings = await getFileMappingsFrom3CX(pool);
  console.log(`  Found ${fileMappings.length} file mappings in 3CX`);

  if (fileMappings.length === 0) return;

  // Get our messages that have these threecx_message_ids
  const threecxIds = fileMappings.map((m) => m.threecx_message_id);
  const { data: ourMessages, error: msgError } = await supabase
    .from("messages")
    .select("id, threecx_message_id, conversation_id")
    .eq("tenant_id", tenantId)
    .in("threecx_message_id", threecxIds);

  if (msgError) {
    console.error("  Error fetching our messages:", msgError.message);
    return;
  }

  console.log(`  Found ${ourMessages?.length || 0} matching messages in our database`);

  // Create a map of threecx_message_id -> our message
  const messageMap = new Map(
    (ourMessages || []).map((m) => [m.threecx_message_id, m])
  );

  // Get our media files
  const { data: mediaFiles, error: mediaError } = await supabase
    .from("media_files")
    .select("id, file_name, message_id")
    .eq("tenant_id", tenantId);

  if (mediaError) {
    console.error("  Error fetching media files:", mediaError.message);
    return;
  }

  console.log(`  Found ${mediaFiles?.length || 0} media files in our database`);

  // Create a map of hash -> media file
  const mediaMap = new Map<string, { id: string; file_name: string; message_id: string | null }>();
  for (const mf of mediaFiles || []) {
    // The file_name might include extension, store both versions
    const hashWithoutExt = mf.file_name.replace(/\.[^/.]+$/, "");
    mediaMap.set(mf.file_name, mf);
    mediaMap.set(hashWithoutExt, mf);
  }

  let linked = 0;
  let alreadyLinked = 0;
  let noMessage = 0;
  let noMedia = 0;

  for (const mapping of fileMappings) {
    // Find our message
    const ourMessage = messageMap.get(mapping.threecx_message_id);
    if (!ourMessage) {
      noMessage++;
      continue;
    }

    // Find our media file by hash
    let mediaFile = mediaMap.get(mapping.internal_file_name);
    if (!mediaFile) {
      // Try without extension
      const hashWithoutExt = mapping.internal_file_name.replace(/\.[^/.]+$/, "");
      mediaFile = mediaMap.get(hashWithoutExt);
    }

    if (!mediaFile) {
      noMedia++;
      console.log(`    No media for hash: ${mapping.internal_file_name.slice(0, 20)}...`);
      continue;
    }

    if (mediaFile.message_id) {
      alreadyLinked++;
      continue;
    }

    // Update the media file (skip width/height as columns may not exist in DB)
    const updateData: Record<string, unknown> = {
      message_id: ourMessage.id,
      file_name: mapping.public_file_name, // Replace hash with original filename
    };

    const { error: updateError } = await supabase
      .from("media_files")
      .update(updateData)
      .eq("id", mediaFile.id);

    if (updateError) {
      console.error(`    Failed to update media ${mediaFile.id}:`, updateError.message);
    } else {
      linked++;
      console.log(`    Linked: ${mapping.public_file_name} -> message ${ourMessage.id.slice(0, 8)}...`);
    }
  }

  console.log(`  Summary: ${linked} linked, ${alreadyLinked} already linked, ${noMessage} no message match, ${noMedia} no media match`);
}

async function main(): Promise<void> {
  console.log("===========================================");
  console.log("  Link Media Files from 3CX Database");
  console.log("===========================================\n");

  // Get tenant config
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("*")
    .eq("is_active", true)
    .single();

  if (tenantError || !tenant) {
    console.error("Failed to get tenant:", tenantError?.message);
    return;
  }

  console.log(`Tenant: ${tenant.name}`);
  console.log(`3CX Host: ${tenant.threecx_host}`);

  // Create SSH tunnel
  const localPort = 15432;
  console.log("Creating SSH tunnel...");

  const tunnel = await createSshTunnel({
    sshHost: tenant.threecx_host,
    sshPort: tenant.ssh_port || 22,
    sshUser: tenant.ssh_user,
    sshPassword: tenant.ssh_password,
    dbHost: "localhost",
    dbPort: 5432,
    localPort,
  });

  console.log("SSH tunnel established");

  try {
    // Connect to 3CX database
    const pool = new Pool({
      host: "127.0.0.1",
      port: localPort,
      user: "phonesystem",
      password: tenant.threecx_db_password || tenant.threecx_password,
      database: "database_single",
    });

    await linkMediaForTenant(tenant.id, tenant.name, pool);

    await pool.end();
  } finally {
    tunnel.close();
  }

  console.log("\n===========================================");
  console.log("  Link Complete!");
  console.log("===========================================");
}

main().catch(console.error);
