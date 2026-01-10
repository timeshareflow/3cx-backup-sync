import { Pool } from "pg";
import { withClient } from "./connection";
import { logger } from "../utils/logger";

export interface ThreeCXMessage {
  message_id: string;
  conversation_id: string;
  is_external: boolean;
  queue_number: string | null;
  sender_participant_ip: string | null;
  sender_participant_name: string | null;
  sender_participant_no: string | null;
  sender_participant_phone: string | null;
  time_sent: Date;
  message: string | null;
}

export interface ThreeCXConversation {
  conversation_id: string;
  is_external: boolean;
  queue_number: string | null;
  from_no: string | null;
  from_name: string | null;
  provider_name: string | null;
  participant_ip: string | null;
  participant_phone: string | null;
  participant_email: string | null;
  time_sent: Date;
  message: string | null;
  chat_name: string | null;
  participants_grp_array: string | null;
  provider_type: string | null;
}

export interface ThreeCXExtension {
  idextension: number;
  extension_number: string;
  firstname: string | null;
  lastname: string | null;
  email?: string | null;
}

// Get messages newer than a specific timestamp (from both active and history)
export async function getNewMessages(
  since: Date | null,
  limit: number = 100,
  pool?: Pool
): Promise<ThreeCXMessage[]> {
  return withClient(async (client) => {
    // Check which views are available
    const schemaCheck = await client.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      AND table_name IN ('chat_messages_history_view', 'chat_messages_view')
    `);
    const availableViews = schemaCheck.rows.map((r) => r.table_name);
    const hasHistory = availableViews.includes("chat_messages_history_view");
    const hasActive = availableViews.includes("chat_messages_view");

    if (!hasHistory && !hasActive) {
      logger.warn("No chat message views found in 3CX database");
      return [];
    }

    // Build query parts for available views
    const queryParts: string[] = [];
    const messageFields = `
      message_id,
      conversation_id,
      is_external,
      queue_number,
      sender_participant_ip,
      sender_participant_name,
      sender_participant_no,
      sender_participant_phone,
      time_sent,
      message
    `;

    if (hasHistory) {
      queryParts.push(`SELECT ${messageFields} FROM chat_messages_history_view`);
    }
    if (hasActive) {
      queryParts.push(`SELECT ${messageFields} FROM chat_messages_view`);
    }

    // Combine with UNION to get both active and archived messages
    const unionQuery = queryParts.join(" UNION ");

    const query = since
      ? `
        SELECT DISTINCT ON (message_id) * FROM (${unionQuery}) combined
        WHERE time_sent > $1
        ORDER BY message_id, time_sent ASC
        LIMIT $2
      `
      : `
        SELECT DISTINCT ON (message_id) * FROM (${unionQuery}) combined
        ORDER BY message_id, time_sent ASC
        LIMIT $1
      `;

    // Re-order by time_sent after deduplication
    const wrappedQuery = `
      SELECT * FROM (${query}) deduped
      ORDER BY time_sent ASC
    `;

    const params = since ? [since, limit] : [limit];
    const result = await client.query(wrappedQuery, params);

    const sources = [hasHistory && "history", hasActive && "active"].filter(Boolean).join("+");
    logger.debug(`Fetched ${result.rows.length} messages from 3CX (${sources})`);
    return result.rows;
  }, pool);
}

// Get conversation metadata (from both active and history)
export async function getConversations(
  conversationIds: string[],
  pool?: Pool
): Promise<ThreeCXConversation[]> {
  if (conversationIds.length === 0) return [];

  return withClient(async (client) => {
    // Check which views are available
    const schemaCheck = await client.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      AND table_name IN ('chat_history_view', 'chat_view')
    `);
    const availableViews = schemaCheck.rows.map((r) => r.table_name);
    const hasHistory = availableViews.includes("chat_history_view");
    const hasActive = availableViews.includes("chat_view");

    if (!hasHistory && !hasActive) {
      logger.warn("No chat views found in 3CX database");
      return [];
    }

    const placeholders = conversationIds.map((_, i) => `$${i + 1}`).join(", ");
    const convFields = `
      conversation_id,
      is_external,
      queue_number,
      from_no,
      from_name,
      provider_name,
      participant_ip,
      participant_phone,
      participant_email,
      time_sent,
      message,
      chat_name,
      participants_grp_array,
      provider_type
    `;

    // Build query parts for available views
    const queryParts: string[] = [];
    if (hasHistory) {
      queryParts.push(`SELECT ${convFields} FROM chat_history_view WHERE conversation_id IN (${placeholders})`);
    }
    if (hasActive) {
      queryParts.push(`SELECT ${convFields} FROM chat_view WHERE conversation_id IN (${placeholders})`);
    }

    // Combine and dedupe
    const unionQuery = queryParts.join(" UNION ");
    const query = `
      SELECT DISTINCT ON (conversation_id) *
      FROM (${unionQuery}) combined
      ORDER BY conversation_id, time_sent DESC
    `;

    // Double the params if we have both views (each UNION part needs its own params)
    const params = hasHistory && hasActive
      ? [...conversationIds, ...conversationIds]
      : conversationIds;

    const result = await client.query(query, params);

    const sources = [hasHistory && "history", hasActive && "active"].filter(Boolean).join("+");
    logger.debug(`Fetched ${result.rows.length} conversations from 3CX (${sources})`);
    return result.rows;
  }, pool);
}

// Get all extensions - compatible with 3CX V20
export async function getExtensions(pool?: Pool): Promise<ThreeCXExtension[]> {
  return withClient(async (client) => {
    // Try 3CX V20 schema first (uses dn table directly)
    try {
      const query = `
        SELECT
          dn.iddn as idextension,
          dn.number as extension_number,
          dn.firstname,
          dn.lastname
        FROM dn
        WHERE dn.number IS NOT NULL
          AND dn.dntype = 0
        ORDER BY dn.number
      `;

      const result = await client.query(query);
      logger.debug(`Fetched ${result.rows.length} extensions from 3CX (V20 schema)`);
      return result.rows;
    } catch (err) {
      logger.warn("V20 schema query failed, trying legacy schema", { error: (err as Error).message });

      // Fallback to legacy schema
      const query = `
        SELECT
          e.id as idextension,
          e.number as extension_number,
          e.firstname,
          e.lastname
        FROM extensions e
        WHERE e.number IS NOT NULL
        ORDER BY e.number
      `;

      const result = await client.query(query);
      logger.debug(`Fetched ${result.rows.length} extensions from 3CX (legacy schema)`);
      return result.rows;
    }
  }, pool);
}

// Get message count for monitoring (from both active and history)
export async function getMessageCount(): Promise<number> {
  return withClient(async (client) => {
    // Check which views are available
    const schemaCheck = await client.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      AND table_name IN ('chat_messages_history_view', 'chat_messages_view')
    `);
    const availableViews = schemaCheck.rows.map((r) => r.table_name);
    const hasHistory = availableViews.includes("chat_messages_history_view");
    const hasActive = availableViews.includes("chat_messages_view");

    if (!hasHistory && !hasActive) {
      return 0;
    }

    // Build query parts for available views
    const queryParts: string[] = [];
    if (hasHistory) {
      queryParts.push("SELECT message_id FROM chat_messages_history_view");
    }
    if (hasActive) {
      queryParts.push("SELECT message_id FROM chat_messages_view");
    }

    // Count distinct messages across both views
    const unionQuery = queryParts.join(" UNION ");
    const result = await client.query(`
      SELECT COUNT(DISTINCT message_id) as count FROM (${unionQuery}) combined
    `);

    return parseInt(result.rows[0].count);
  });
}

// Discover all chat-related tables and views
export async function discoverChatTables(): Promise<{
  tables: string[];
  views: string[];
}> {
  return withClient(async (client) => {
    // Find all chat-related tables
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE '%chat%'
      ORDER BY table_name
    `);

    // Find all chat-related views
    const viewsResult = await client.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      AND table_name LIKE '%chat%'
      ORDER BY table_name
    `);

    const tables = tablesResult.rows.map((r) => r.table_name);
    const views = viewsResult.rows.map((r) => r.table_name);

    logger.info("Discovered chat tables/views", { tables, views });

    return { tables, views };
  });
}

// Check if specific tables/views exist
export async function checkDatabaseSchema(): Promise<{
  hasMessagesView: boolean;
  hasHistoryView: boolean;
  hasActiveMessagesView: boolean;
  hasActiveView: boolean;
}> {
  return withClient(async (client) => {
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      AND table_name IN (
        'chat_messages_history_view',
        'chat_history_view',
        'chat_messages_view',
        'chat_view'
      )
    `);

    const views = result.rows.map((r) => r.table_name);

    return {
      hasMessagesView: views.includes("chat_messages_history_view"),
      hasHistoryView: views.includes("chat_history_view"),
      hasActiveMessagesView: views.includes("chat_messages_view"),
      hasActiveView: views.includes("chat_view"),
    };
  });
}
