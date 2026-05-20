import { Pool, PoolClient } from "pg";
import { logger } from "../utils/logger";

let pool: Pool | null = null;

function parseDbUrl(url: string) {
  // Standard URL parsers break on # and @ in passwords.
  // Split manually: everything between :// and the last @ is userinfo.
  const withoutScheme = url.replace(/^postgres(?:ql)?:\/\//, "");
  const lastAt = withoutScheme.lastIndexOf("@");
  if (lastAt === -1) throw new Error("Invalid DATABASE_URL — missing @");

  const userInfo = withoutScheme.slice(0, lastAt);
  const hostPart = withoutScheme.slice(lastAt + 1);

  const colonIdx = userInfo.indexOf(":");
  const user = userInfo.slice(0, colonIdx);
  const password = userInfo.slice(colonIdx + 1);

  const slashIdx = hostPart.indexOf("/");
  const hostPort = slashIdx === -1 ? hostPart : hostPart.slice(0, slashIdx);
  const database = slashIdx === -1 ? "postgres" : hostPart.slice(slashIdx + 1).split("?")[0];
  const portColon = hostPort.lastIndexOf(":");
  const host = portColon === -1 ? hostPort : hostPort.slice(0, portColon);
  const port = portColon === -1 ? 5432 : parseInt(hostPort.slice(portColon + 1));

  return { user, password, host, port, database };
}

export function getPgPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL not set — direct Postgres unavailable");

    const parsed = parseDbUrl(url);
    pool = new Pool({
      ...parsed,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    pool.on("error", (err) => logger.error("PG pool error", { error: err.message }));
    logger.info("Direct Postgres pool created");
  }
  return pool;
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function pgBulkInsertMessages(
  messages: Array<{
    conversation_id: string;
    threecx_message_id: string;
    sender_identifier?: string | null;
    sender_name?: string | null;
    content?: string | null;
    message_type?: string;
    has_media?: boolean;
    sent_at: string;
    tenant_id: string;
  }>
): Promise<string[]> {
  if (messages.length === 0) return [];
  const pg = getPgPool();

  const values: unknown[] = [];
  const placeholders = messages.map((m, i) => {
    const base = i * 9;
    values.push(
      m.conversation_id, m.threecx_message_id, m.sender_identifier ?? null,
      m.sender_name ?? null, m.content ?? null, m.message_type ?? "text",
      m.has_media ?? false, m.sent_at, m.tenant_id
    );
    return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9})`;
  });

  const sql = `
    INSERT INTO messages
      (conversation_id, threecx_message_id, sender_identifier, sender_name,
       content, message_type, has_media, sent_at, tenant_id)
    VALUES ${placeholders.join(",")}
    ON CONFLICT (tenant_id, threecx_message_id) DO NOTHING
    RETURNING id
  `;

  const { rows } = await pg.query(sql, values);
  return rows.map((r) => r.id);
}

// ─── Conversations ────────────────────────────────────────────────────────────

export async function pgBulkUpsertConversations(
  conversations: Array<{
    threecx_conversation_id: string;
    conversation_name?: string | null;
    channel_type?: string | null;
    is_external?: boolean;
    is_group_chat?: boolean;
    tenant_id: string;
  }>
): Promise<void> {
  if (conversations.length === 0) return;
  const pg = getPgPool();

  const values: unknown[] = [];
  const placeholders = conversations.map((c, i) => {
    const base = i * 6;
    values.push(
      c.tenant_id, c.threecx_conversation_id,
      c.conversation_name ?? null, c.channel_type ?? "internal",
      c.is_external ?? false, c.is_group_chat ?? false
    );
    return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6})`;
  });

  await pg.query(`
    INSERT INTO conversations
      (tenant_id, threecx_conversation_id, conversation_name, channel_type, is_external, is_group_chat)
    VALUES ${placeholders.join(",")}
    ON CONFLICT (tenant_id, threecx_conversation_id)
    DO UPDATE SET
      conversation_name = COALESCE(EXCLUDED.conversation_name, conversations.conversation_name),
      channel_type      = EXCLUDED.channel_type,
      is_external       = EXCLUDED.is_external,
      is_group_chat     = EXCLUDED.is_group_chat
  `, values);
}

// ─── Call Logs (CDR) ──────────────────────────────────────────────────────────

export async function pgBulkInsertCallLogs(
  callLogs: Array<{
    tenant_id: string;
    threecx_call_id?: string;
    caller_number?: string;
    caller_name?: string;
    callee_number?: string;
    callee_name?: string;
    direction?: string;
    call_type?: string;
    status?: string;
    ring_duration_seconds?: number;
    total_duration_seconds?: number;
    talk_duration_seconds?: number;
    call_started_at: string;
    call_answered_at?: string;
    call_ended_at?: string;
  }>
): Promise<{ inserted: number; skipped: number }> {
  if (callLogs.length === 0) return { inserted: 0, skipped: 0 };
  const pg = getPgPool();

  // Split into chunks to avoid exceeding max parameters (65535)
  const CHUNK = 500;
  let inserted = 0;

  for (let i = 0; i < callLogs.length; i += CHUNK) {
    const chunk = callLogs.slice(i, i + CHUNK);
    const values: unknown[] = [];
    const placeholders = chunk.map((c, idx) => {
      const base = idx * 11;
      values.push(
        c.tenant_id, c.threecx_call_id ?? null,
        c.caller_number ?? null, c.caller_name ?? null,
        c.callee_number ?? null, c.callee_name ?? null,
        c.direction ?? null, c.call_type ?? null,
        c.ring_duration_seconds ?? null,
        c.total_duration_seconds ?? c.talk_duration_seconds ?? null,
        c.call_started_at
      );
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11})`;
    });

    const { rowCount } = await pg.query(`
      INSERT INTO call_logs
        (tenant_id, threecx_call_id, caller_number, caller_name,
         callee_number, callee_name, direction, call_type,
         ring_duration_seconds, duration_seconds, started_at)
      VALUES ${placeholders.join(",")}
      ON CONFLICT (tenant_id, threecx_call_id) DO NOTHING
    `, values);

    inserted += rowCount ?? 0;
  }

  return { inserted, skipped: callLogs.length - inserted };
}

// ─── Media filenames (duplicate check) ───────────────────────────────────────

export async function pgGetSyncedFilenames(
  tenantId: string,
  category: string
): Promise<Set<string>> {
  const pg = getPgPool();
  const prefix = `${tenantId}/${category}/`;

  const { rows } = await pg.query(
    `SELECT storage_path FROM media_files WHERE tenant_id = $1 AND storage_path LIKE $2`,
    [tenantId, `${prefix}%`]
  );

  const set = new Set<string>();
  for (const row of rows) {
    const parts = (row.storage_path as string).split("/");
    const filename = parts[parts.length - 1];
    if (filename) {
      const dot = filename.lastIndexOf(".");
      set.add(dot > 0 ? filename.substring(0, dot) : filename);
    }
  }
  return set;
}

export async function closePgPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
