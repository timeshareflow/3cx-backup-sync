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

export interface ThreeCXFileMapping {
  message_id: string;
  internal_file_name: string; // Hash stored on disk
  public_file_name: string; // Original filename
  file_info: {
    HasPreview?: boolean;
    FileType?: number;
    Width?: number;
    Height?: number;
    Size?: number;
  } | null;
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

// Get all extensions - compatible with 3CX V20 and hosted 3CX
export async function getExtensions(pool?: Pool): Promise<ThreeCXExtension[]> {
  return withClient(async (client) => {
    logger.info("Fetching extensions from 3CX database...");

    // Try users_view first (3CX hosted / V20+)
    try {
      const query = `
        SELECT
          uv.id as idextension,
          uv.dn as extension_number,
          u.firstname,
          u.lastname
        FROM users_view uv
        LEFT JOIN users u ON u.iduser = uv.id
        WHERE uv.dn IS NOT NULL
        ORDER BY uv.dn
      `;

      const result = await client.query(query);
      logger.info(`Fetched ${result.rows.length} extensions from 3CX (users_view)`);
      return result.rows;
    } catch (err) {
      logger.warn("users_view query failed, trying legacy dn schema", { error: (err as Error).message });

      // Fallback to legacy dn schema
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
        logger.info(`Fetched ${result.rows.length} extensions from 3CX (dn schema)`);
        return result.rows;
      } catch (err2) {
        logger.error("Both extension queries failed", {
          usersViewError: (err as Error).message,
          dnError: (err2 as Error).message,
        });
        return [];
      }
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

// Get file mappings for messages with attachments
export async function getFileMappings(
  messageIds: string[],
  pool?: Pool
): Promise<ThreeCXFileMapping[]> {
  if (messageIds.length === 0) return [];

  return withClient(async (client) => {
    // Convert string message IDs to integers for comparison
    const numericIds = messageIds.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));
    if (numericIds.length === 0) return [];

    const placeholders = numericIds.map((_, i) => `$${i + 1}`).join(", ");

    const query = `
      SELECT
        id_message::text as message_id,
        internal_file_name,
        public_file_name,
        file_info
      FROM chat_message
      WHERE id_message IN (${placeholders})
        AND internal_file_name IS NOT NULL
    `;

    const result = await client.query(query, numericIds);

    return result.rows.map((row) => ({
      message_id: row.message_id,
      internal_file_name: row.internal_file_name,
      public_file_name: row.public_file_name,
      file_info: row.file_info ? JSON.parse(row.file_info) : null,
    }));
  }, pool);
}

// Get ALL conversations from the live chat_conversation table (including those with 0 messages)
export async function getAllLiveConversations(
  pool?: Pool
): Promise<Array<{
  conversation_id: string;
  chat_name: string | null;
  is_external: boolean;
  message_count: number;
  is_group_chat: boolean;
}>> {
  return withClient(async (client) => {
    // Check if chat_history_view exists to get generated names
    const viewCheck = await client.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      AND table_name = 'chat_history_view'
    `);
    const hasHistoryView = viewCheck.rows.length > 0;

    let query: string;

    if (hasHistoryView) {
      // Use chat_history_view to get generated names for conversations
      // The view generates a chat_name from participants when public_name is null/empty
      // NULLIF handles empty strings by converting them to NULL for COALESCE
      // Determine is_group_chat by: public_name is set OR more than 2 participants in party column
      // For 1-on-1 chats with no messages (no chat_history_view entry), generate name from extensions
      query = `
        SELECT
          c.id::text as conversation_id,
          COALESCE(
            NULLIF(c.public_name, ''),
            h.chat_name,
            ext_names.generated_name
          ) as chat_name,
          c.is_external,
          COUNT(m.id_message) as message_count,
          (NULLIF(c.public_name, '') IS NOT NULL OR array_length(string_to_array(c.party, ':'), 1) > 2) as is_group_chat
        FROM chat_conversation c
        LEFT JOIN chat_message m ON m.fkid_chat_conversation = c.id
        LEFT JOIN LATERAL (
          SELECT DISTINCT chat_name
          FROM chat_history_view
          WHERE conversation_id = c.id
          AND chat_name IS NOT NULL
          AND chat_name != ''
          LIMIT 1
        ) h ON true
        LEFT JOIN LATERAL (
          -- Generate name from extension numbers for 1-on-1 chats without history
          SELECT string_agg(
            COALESCE(
              NULLIF(TRIM(COALESCE(u.firstname, '') || ' ' || COALESCE(u.lastname, '')), ''),
              uv.dn
            ) || ' (' || uv.dn || ')',
            ', '
            ORDER BY uv.dn
          ) as generated_name
          FROM unnest(string_to_array(c.party, ':')) as ext_num
          LEFT JOIN users_view uv ON uv.dn = ext_num
          LEFT JOIN users u ON u.iduser = uv.id
          WHERE ext_num != '3CX'  -- Skip system identifier
        ) ext_names ON h.chat_name IS NULL AND NULLIF(c.public_name, '') IS NULL
        GROUP BY c.id, c.public_name, c.is_external, c.party, h.chat_name, ext_names.generated_name
        ORDER BY c.id
      `;
    } else {
      // Fallback: just use public_name from chat_conversation
      query = `
        SELECT
          c.id::text as conversation_id,
          NULLIF(c.public_name, '') as chat_name,
          c.is_external,
          COUNT(m.id_message) as message_count,
          (NULLIF(c.public_name, '') IS NOT NULL OR array_length(string_to_array(c.party, ':'), 1) > 2) as is_group_chat
        FROM chat_conversation c
        LEFT JOIN chat_message m ON m.fkid_chat_conversation = c.id
        GROUP BY c.id, c.public_name, c.is_external, c.party
        ORDER BY c.id
      `;
    }

    const result = await client.query(query);
    logger.info(`Fetched ${result.rows.length} live conversations from 3CX (including empty ones)`);
    return result.rows.map((row) => ({
      ...row,
      message_count: parseInt(row.message_count, 10),
    }));
  }, pool);
}

// Get all file mappings for recent messages (for bulk sync)
export async function getAllFileMappings(
  limit: number = 1000,
  pool?: Pool
): Promise<ThreeCXFileMapping[]> {
  return withClient(async (client) => {
    const query = `
      SELECT
        id_message::text as message_id,
        internal_file_name,
        public_file_name,
        file_info
      FROM chat_message
      WHERE internal_file_name IS NOT NULL
      ORDER BY id_message DESC
      LIMIT $1
    `;

    const result = await client.query(query, [limit]);

    return result.rows.map((row) => ({
      message_id: row.message_id,
      internal_file_name: row.internal_file_name,
      public_file_name: row.public_file_name,
      file_info: row.file_info ? JSON.parse(row.file_info) : null,
    }));
  }, pool);
}

// ============================================
// RECORDINGS
// ============================================

export interface ThreeCXRecording {
  recording_id: string;
  call_participants_id: string | null;
  recording_url: string;
  start_time: Date | null;
  end_time: Date | null;
  duration_seconds: number | null;
  transcription: string | null;
  extension_number: string | null;
  caller_number: string | null;
  callee_number: string | null;
}

// Get recordings from 3CX database
export async function getRecordings(
  since: Date | null,
  limit: number = 500,
  pool?: Pool
): Promise<ThreeCXRecording[]> {
  return withClient(async (client) => {
    // Check if recordings table exists
    const schemaCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'recordings'
    `);

    if (schemaCheck.rows.length === 0) {
      logger.warn("No recordings table found in 3CX database");
      return [];
    }

    // First check what columns exist in the recordings table
    const columnsCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'recordings'
    `);
    const columnNames = columnsCheck.rows.map((r) => r.column_name);

    // Build query based on available columns
    const hasParticipantId = columnNames.includes("cl_participants_id");
    const hasStartTime = columnNames.includes("start_time");
    const hasEndTime = columnNames.includes("end_time");
    const hasTranscription = columnNames.includes("transcription");

    const timeColumn = hasStartTime ? "start_time" : "id_recording";
    const orderClause = hasStartTime ? "start_time ASC" : "id_recording ASC";

    const query = since && hasStartTime
      ? `
        SELECT
          id_recording::text as recording_id,
          ${hasParticipantId ? "cl_participants_id::text" : "NULL"} as call_participants_id,
          recording_url,
          ${hasStartTime ? "start_time" : "NULL"} as start_time,
          ${hasEndTime ? "end_time" : "NULL"} as end_time,
          ${hasStartTime && hasEndTime ? "EXTRACT(EPOCH FROM (end_time - start_time))::int" : "NULL"} as duration_seconds,
          ${hasTranscription ? "transcription" : "NULL"} as transcription,
          NULL as extension_number,
          NULL as caller_number,
          NULL as callee_number
        FROM recordings
        WHERE ${timeColumn} > $1
        ORDER BY ${orderClause}
        LIMIT $2
      `
      : `
        SELECT
          id_recording::text as recording_id,
          ${hasParticipantId ? "cl_participants_id::text" : "NULL"} as call_participants_id,
          recording_url,
          ${hasStartTime ? "start_time" : "NULL"} as start_time,
          ${hasEndTime ? "end_time" : "NULL"} as end_time,
          ${hasStartTime && hasEndTime ? "EXTRACT(EPOCH FROM (end_time - start_time))::int" : "NULL"} as duration_seconds,
          ${hasTranscription ? "transcription" : "NULL"} as transcription,
          NULL as extension_number,
          NULL as caller_number,
          NULL as callee_number
        FROM recordings
        ORDER BY ${orderClause}
        LIMIT $1
      `;

    const params = since && hasStartTime ? [since, limit] : [limit];
    const result = await client.query(query, params);

    logger.info(`Fetched ${result.rows.length} recordings from 3CX database`);
    return result.rows;
  }, pool);
}

// ============================================
// CALL DETAIL RECORDS (CDR)
// ============================================

export interface ThreeCXCallRecord {
  call_id: string;
  caller_number: string | null;
  caller_name: string | null;
  callee_number: string | null;
  callee_name: string | null;
  extension_number: string | null;
  direction: "inbound" | "outbound" | "internal";
  call_type: string | null;
  status: string | null;
  ring_duration: number | null;
  talk_duration: number | null;
  total_duration: number | null;
  call_started_at: Date;
  call_answered_at: Date | null;
  call_ended_at: Date | null;
  has_recording: boolean;
}

// Get CDR records from 3CX database
export async function getCallRecords(
  since: Date | null,
  limit: number = 500,
  pool?: Pool
): Promise<ThreeCXCallRecord[]> {
  return withClient(async (client) => {
    // 3CX stores call logs in different tables depending on version
    // Try cl (call log) table first, then callhistory3, then fallback to cdr table

    // Check which tables exist (including myphone_callhistory_v14 for hosted 3CX)
    const schemaCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('cl', 'callhistory3', 'cdr', 'callhistory', 'call_history', 'myphone_callhistory_v14')
    `);
    const availableTables = schemaCheck.rows.map((r) => r.table_name);

    if (availableTables.length === 0) {
      logger.warn("No CDR tables found in 3CX database");
      return [];
    }

    // Prioritize myphone_callhistory_v14 for hosted 3CX (most reliable)
    const orderedTables = [
      "myphone_callhistory_v14",
      "cl",
      "callhistory3",
      ...availableTables.filter(t => !["myphone_callhistory_v14", "cl", "callhistory3"].includes(t))
    ].filter(t => availableTables.includes(t));

    // Try each possible table in priority order
    for (const tableName of orderedTables) {
      try {
        let query: string;
        let params: (Date | number)[];

        if (tableName === "myphone_callhistory_v14") {
          // 3CX Hosted - myphone_callhistory_v14 is the most reliable call history table
          // Columns: idmpch14, call_id, calltype, dnowner, party_dn, party_name, party_callerid,
          //          start_time, established_time, end_time, end_status, dialed_number
          query = since
            ? `
              SELECT
                idmpch14::text as call_id,
                party_callerid as caller_number,
                party_name as caller_name,
                dialed_number as callee_number,
                party_name as callee_name,
                dnowner::text as extension_number,
                CASE
                  WHEN calltype = 1 THEN 'inbound'
                  WHEN calltype = 2 THEN 'outbound'
                  ELSE 'internal'
                END as direction,
                calltype::text as call_type,
                CASE
                  WHEN established_time IS NOT NULL THEN 'answered'
                  WHEN end_status = 5 THEN 'missed'
                  ELSE 'missed'
                END as status,
                NULL::integer as ring_duration,
                CASE
                  WHEN established_time IS NOT NULL
                  THEN EXTRACT(EPOCH FROM (end_time - established_time))::integer
                  ELSE 0
                END as talk_duration,
                EXTRACT(EPOCH FROM (end_time - start_time))::integer as total_duration,
                start_time as call_started_at,
                established_time as call_answered_at,
                end_time as call_ended_at,
                false as has_recording
              FROM myphone_callhistory_v14
              WHERE start_time > $1
              ORDER BY start_time ASC
              LIMIT $2
            `
            : `
              SELECT
                idmpch14::text as call_id,
                party_callerid as caller_number,
                party_name as caller_name,
                dialed_number as callee_number,
                party_name as callee_name,
                dnowner::text as extension_number,
                CASE
                  WHEN calltype = 1 THEN 'inbound'
                  WHEN calltype = 2 THEN 'outbound'
                  ELSE 'internal'
                END as direction,
                calltype::text as call_type,
                CASE
                  WHEN established_time IS NOT NULL THEN 'answered'
                  WHEN end_status = 5 THEN 'missed'
                  ELSE 'missed'
                END as status,
                NULL::integer as ring_duration,
                CASE
                  WHEN established_time IS NOT NULL
                  THEN EXTRACT(EPOCH FROM (end_time - established_time))::integer
                  ELSE 0
                END as talk_duration,
                EXTRACT(EPOCH FROM (end_time - start_time))::integer as total_duration,
                start_time as call_started_at,
                established_time as call_answered_at,
                end_time as call_ended_at,
                false as has_recording
              FROM myphone_callhistory_v14
              ORDER BY start_time ASC
              LIMIT $1
            `;
          params = since ? [since, limit] : [limit];
        } else if (tableName === "cl") {
          // 3CX V18+ cl table schema
          query = since
            ? `
              SELECT
                idcl::text as call_id,
                src as caller_number,
                srcname as caller_name,
                dst as callee_number,
                dstname as callee_name,
                CASE
                  WHEN srcdn IS NOT NULL THEN srcdn
                  ELSE dstdn
                END as extension_number,
                CASE
                  WHEN is_outbound = true THEN 'outbound'
                  WHEN srcdn IS NULL THEN 'inbound'
                  ELSE 'internal'
                END as direction,
                calltype as call_type,
                CASE
                  WHEN talk_time > 0 THEN 'answered'
                  ELSE 'missed'
                END as status,
                ring_time as ring_duration,
                talk_time as talk_duration,
                (ring_time + talk_time + hold_time) as total_duration,
                start_time as call_started_at,
                CASE WHEN talk_time > 0 THEN start_time + (ring_time * INTERVAL '1 second') ELSE NULL END as call_answered_at,
                end_time as call_ended_at,
                COALESCE(has_rec, false) as has_recording
              FROM cl
              WHERE start_time > $1
              ORDER BY start_time ASC
              LIMIT $2
            `
            : `
              SELECT
                idcl::text as call_id,
                src as caller_number,
                srcname as caller_name,
                dst as callee_number,
                dstname as callee_name,
                CASE
                  WHEN srcdn IS NOT NULL THEN srcdn
                  ELSE dstdn
                END as extension_number,
                CASE
                  WHEN is_outbound = true THEN 'outbound'
                  WHEN srcdn IS NULL THEN 'inbound'
                  ELSE 'internal'
                END as direction,
                calltype as call_type,
                CASE
                  WHEN talk_time > 0 THEN 'answered'
                  ELSE 'missed'
                END as status,
                ring_time as ring_duration,
                talk_time as talk_duration,
                (ring_time + talk_time + hold_time) as total_duration,
                start_time as call_started_at,
                CASE WHEN talk_time > 0 THEN start_time + (ring_time * INTERVAL '1 second') ELSE NULL END as call_answered_at,
                end_time as call_ended_at,
                COALESCE(has_rec, false) as has_recording
              FROM cl
              ORDER BY start_time ASC
              LIMIT $1
            `;
          params = since ? [since, limit] : [limit];
        } else if (tableName === "callhistory3") {
          // 3CX Hosted / V20+ callhistory3 table schema
          // Columns: idcallhistory3, callid, starttime, answertime, endtime, duration,
          //          is_answ, is_fail, is_compl, is_fromoutside, mediatype,
          //          from_no, to_no, callerid, dialednumber, group_no, line_no
          query = since
            ? `
              SELECT
                idcallhistory3::text as call_id,
                from_no as caller_number,
                callerid as caller_name,
                to_no as callee_number,
                dialednumber as callee_name,
                COALESCE(group_no, line_no) as extension_number,
                CASE
                  WHEN is_fromoutside = true THEN 'inbound'
                  ELSE 'outbound'
                END as direction,
                mediatype::text as call_type,
                CASE
                  WHEN is_answ = true THEN 'answered'
                  WHEN is_fail = true THEN 'failed'
                  ELSE 'missed'
                END as status,
                NULL::integer as ring_duration,
                EXTRACT(EPOCH FROM (endtime - answertime))::integer as talk_duration,
                EXTRACT(EPOCH FROM duration)::integer as total_duration,
                starttime as call_started_at,
                CASE WHEN is_answ = true THEN answertime ELSE NULL END as call_answered_at,
                endtime as call_ended_at,
                false as has_recording
              FROM callhistory3
              WHERE starttime > $1
              ORDER BY starttime ASC
              LIMIT $2
            `
            : `
              SELECT
                idcallhistory3::text as call_id,
                from_no as caller_number,
                callerid as caller_name,
                to_no as callee_number,
                dialednumber as callee_name,
                COALESCE(group_no, line_no) as extension_number,
                CASE
                  WHEN is_fromoutside = true THEN 'inbound'
                  ELSE 'outbound'
                END as direction,
                mediatype::text as call_type,
                CASE
                  WHEN is_answ = true THEN 'answered'
                  WHEN is_fail = true THEN 'failed'
                  ELSE 'missed'
                END as status,
                NULL::integer as ring_duration,
                EXTRACT(EPOCH FROM (endtime - answertime))::integer as talk_duration,
                EXTRACT(EPOCH FROM duration)::integer as total_duration,
                starttime as call_started_at,
                CASE WHEN is_answ = true THEN answertime ELSE NULL END as call_answered_at,
                endtime as call_ended_at,
                false as has_recording
              FROM callhistory3
              ORDER BY starttime ASC
              LIMIT $1
            `;
          params = since ? [since, limit] : [limit];
        } else {
          // Generic fallback for other table names
          query = since
            ? `
              SELECT
                id::text as call_id,
                caller as caller_number,
                caller_name,
                callee as callee_number,
                callee_name,
                extension as extension_number,
                COALESCE(direction, 'unknown') as direction,
                call_type,
                status,
                ring_duration,
                talk_duration,
                total_duration,
                start_time as call_started_at,
                answer_time as call_answered_at,
                end_time as call_ended_at,
                COALESCE(has_recording, false) as has_recording
              FROM ${tableName}
              WHERE start_time > $1
              ORDER BY start_time ASC
              LIMIT $2
            `
            : `
              SELECT
                id::text as call_id,
                caller as caller_number,
                caller_name,
                callee as callee_number,
                callee_name,
                extension as extension_number,
                COALESCE(direction, 'unknown') as direction,
                call_type,
                status,
                ring_duration,
                talk_duration,
                total_duration,
                start_time as call_started_at,
                answer_time as call_answered_at,
                end_time as call_ended_at,
                COALESCE(has_recording, false) as has_recording
              FROM ${tableName}
              ORDER BY start_time ASC
              LIMIT $1
            `;
          params = since ? [since, limit] : [limit];
        }

        const result = await client.query(query, params);
        logger.info(`Fetched ${result.rows.length} CDR records from 3CX (${tableName})`);
        return result.rows;
      } catch (err) {
        logger.debug(`CDR query failed for table ${tableName}`, { error: (err as Error).message });
        continue;
      }
    }

    logger.warn("All CDR query attempts failed");
    return [];
  }, pool);
}

// ============================================
// VOICEMAILS
// ============================================

export interface ThreeCXVoicemail {
  voicemail_id: string;
  wav_file: string;
  extension: string;
  caller_number: string | null;
  caller_name: string | null;
  duration_ms: number | null;
  created_at: Date;
  is_heard: boolean;
  transcription: string | null;
}

export async function getVoicemails(
  since: Date | null,
  limit: number,
  pool: Pool
): Promise<ThreeCXVoicemail[]> {
  return withClient(async (client) => {
    // Check if s_voicemail table exists
    const schemaCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 's_voicemail'
    `);

    if (schemaCheck.rows.length === 0) {
      logger.warn("No s_voicemail table found in 3CX database");
      return [];
    }

    // Query voicemails
    const query = since
      ? `
        SELECT
          id::text as voicemail_id,
          wav_file,
          callee as extension,
          caller as caller_number,
          caller_name,
          CAST(duration AS integer) as duration_ms,
          TO_TIMESTAMP(created_time, 'YYYYMMDDHH24MISS.FF') as created_at,
          COALESCE(heard = '1', false) as is_heard,
          transcription
        FROM s_voicemail
        WHERE removed IS NULL
        AND TO_TIMESTAMP(created_time, 'YYYYMMDDHH24MISS.FF') > $1
        ORDER BY created_time ASC
        LIMIT $2
      `
      : `
        SELECT
          id::text as voicemail_id,
          wav_file,
          callee as extension,
          caller as caller_number,
          caller_name,
          CAST(duration AS integer) as duration_ms,
          TO_TIMESTAMP(created_time, 'YYYYMMDDHH24MISS.FF') as created_at,
          COALESCE(heard = '1', false) as is_heard,
          transcription
        FROM s_voicemail
        WHERE removed IS NULL
        ORDER BY created_time ASC
        LIMIT $1
      `;

    const params = since ? [since, limit] : [limit];
    const result = await client.query(query, params);

    logger.info(`Fetched ${result.rows.length} voicemails from 3CX database`);
    return result.rows;
  }, pool);
}
