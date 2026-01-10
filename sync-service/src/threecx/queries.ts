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

// Get messages newer than a specific timestamp
export async function getNewMessages(
  since: Date | null,
  limit: number = 100,
  pool?: Pool
): Promise<ThreeCXMessage[]> {
  return withClient(async (client) => {
    const query = since
      ? `
        SELECT
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
        FROM chat_messages_history_view
        WHERE time_sent > $1
        ORDER BY time_sent ASC
        LIMIT $2
      `
      : `
        SELECT
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
        FROM chat_messages_history_view
        ORDER BY time_sent ASC
        LIMIT $1
      `;

    const params = since ? [since, limit] : [limit];
    const result = await client.query(query, params);

    logger.debug(`Fetched ${result.rows.length} messages from 3CX`);
    return result.rows;
  }, pool);
}

// Get conversation metadata
export async function getConversations(
  conversationIds: string[],
  pool?: Pool
): Promise<ThreeCXConversation[]> {
  if (conversationIds.length === 0) return [];

  return withClient(async (client) => {
    const placeholders = conversationIds.map((_, i) => `$${i + 1}`).join(", ");
    const query = `
      SELECT DISTINCT ON (conversation_id)
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
      FROM chat_history_view
      WHERE conversation_id IN (${placeholders})
      ORDER BY conversation_id, time_sent DESC
    `;

    const result = await client.query(query, conversationIds);
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

// Get message count for monitoring
export async function getMessageCount(): Promise<number> {
  return withClient(async (client) => {
    const result = await client.query(
      "SELECT COUNT(*) as count FROM chat_messages_history_view"
    );
    return parseInt(result.rows[0].count);
  });
}

// Check if specific tables/views exist
export async function checkDatabaseSchema(): Promise<{
  hasMessagesView: boolean;
  hasHistoryView: boolean;
}> {
  return withClient(async (client) => {
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      AND table_name IN ('chat_messages_history_view', 'chat_history_view')
    `);

    const views = result.rows.map((r) => r.table_name);

    return {
      hasMessagesView: views.includes("chat_messages_history_view"),
      hasHistoryView: views.includes("chat_history_view"),
    };
  });
}
