import { Client } from "pg";
import { logger } from "../utils/logger";

export interface RealtimeMessagePayload {
  id_message: number;
  msg_gid: string;
  fkid_chat_conversation: number;
  time_sent: string;
  has_media: boolean;
  public_file_name: string | null;
  internal_file_name: string | null;
  file_info: string | null;
}

type NotifyHandler = (payload: RealtimeMessagePayload) => Promise<void>;

interface ListenerState {
  tenantId: string;
  client: Client | null;
  isConnected: boolean;
  stopped: boolean;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  handler: NotifyHandler;
}

const BASE_RECONNECT_MS = 5_000;
const MAX_RECONNECT_MS = 5 * 60_000; // cap at 5 minutes

function reconnectDelay(attempts: number): number {
  // Exponential backoff: 5s, 10s, 20s, 40s, 80s, 160s, 300s (capped)
  return Math.min(BASE_RECONNECT_MS * Math.pow(2, Math.min(attempts, 7)), MAX_RECONNECT_MS);
}

function makeClient(): Client {
  return new Client({
    host: process.env.THREECX_DB_HOST || "127.0.0.1",
    port: parseInt(process.env.THREECX_DB_PORT || "5432"),
    database: process.env.THREECX_DB_NAME || "database_single",
    user: process.env.THREECX_DB_USER || "phonesystem",
    password: process.env.THREECX_DB_PASSWORD,
  });
}

async function connectListener(state: ListenerState): Promise<void> {
  if (state.stopped) return;

  const client = makeClient();
  state.client = client;

  // Handle unexpected errors from the client
  client.on("error", (err) => {
    logger.error("Realtime listener client error", { tenantId: state.tenantId, error: err.message });
    state.isConnected = false;
    state.client = null;
    scheduleReconnect(state);
  });

  // Handle unexpected disconnections
  client.on("end", () => {
    if (!state.stopped) {
      logger.warn("Realtime listener disconnected", { tenantId: state.tenantId });
      state.isConnected = false;
      state.client = null;
      scheduleReconnect(state);
    }
  });

  try {
    await client.connect();

    client.on("notification", (msg) => {
      if (msg.channel !== "new_chat_message" || !msg.payload) return;

      let payload: RealtimeMessagePayload;
      try {
        payload = JSON.parse(msg.payload) as RealtimeMessagePayload;
      } catch {
        logger.error("Realtime: failed to parse notification payload", {
          tenantId: state.tenantId,
          raw: msg.payload?.slice(0, 200),
        });
        return;
      }

      logger.info("Realtime: new chat message received", {
        tenantId: state.tenantId,
        id_message: payload.id_message,
        has_media: payload.has_media,
      });

      // Fire-and-forget — handler errors are caught internally
      state.handler(payload).catch((err) => {
        logger.error("Realtime handler threw unexpectedly", {
          tenantId: state.tenantId,
          error: (err as Error).message,
        });
      });
    });

    await client.query("LISTEN new_chat_message");
    state.isConnected = true;
    state.reconnectAttempts = 0;
    logger.info("Realtime listener connected and listening for new_chat_message", {
      tenantId: state.tenantId,
    });
  } catch (err) {
    state.client = null;
    state.isConnected = false;
    logger.error("Realtime listener failed to connect", {
      tenantId: state.tenantId,
      error: (err as Error).message,
    });
    scheduleReconnect(state);
  }
}

function scheduleReconnect(state: ListenerState): void {
  // Guard: don't schedule multiple reconnects
  if (state.stopped || state.reconnectTimer) return;

  const delay = reconnectDelay(state.reconnectAttempts++);
  logger.info(`Realtime listener will reconnect in ${Math.round(delay / 1000)}s`, {
    tenantId: state.tenantId,
    attempt: state.reconnectAttempts,
  });

  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    connectListener(state).catch((err) => {
      logger.error("Realtime listener reconnect failed", {
        tenantId: state.tenantId,
        error: (err as Error).message,
      });
    });
  }, delay);
}

// Map of tenantId → listener state
const listeners = new Map<string, ListenerState>();

export function startRealtimeListener(tenantId: string, handler: NotifyHandler): void {
  if (listeners.has(tenantId)) {
    logger.debug("Realtime listener already running for tenant", { tenantId });
    return;
  }

  const state: ListenerState = {
    tenantId,
    client: null,
    isConnected: false,
    stopped: false,
    reconnectAttempts: 0,
    reconnectTimer: null,
    handler,
  };

  listeners.set(tenantId, state);

  connectListener(state).catch((err) => {
    logger.error("Realtime listener initial startup error", {
      tenantId,
      error: (err as Error).message,
    });
  });

  logger.info("Realtime listener starting for tenant", { tenantId });
}

export async function stopRealtimeListener(tenantId: string): Promise<void> {
  const state = listeners.get(tenantId);
  if (!state) return;

  state.stopped = true;

  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }

  if (state.client) {
    try {
      await state.client.end();
    } catch {
      // Ignore disconnect errors on shutdown
    }
    state.client = null;
  }

  listeners.delete(tenantId);
  logger.info("Realtime listener stopped", { tenantId });
}

export async function stopAllRealtimeListeners(): Promise<void> {
  const tenantIds = [...listeners.keys()];
  await Promise.all(tenantIds.map((id) => stopRealtimeListener(id)));
}

export function realtimeListenerStatus(): Record<string, boolean> {
  const status: Record<string, boolean> = {};
  for (const [id, state] of listeners) {
    status[id] = state.isConnected;
  }
  return status;
}
