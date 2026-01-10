/**
 * Verify Sync Script
 *
 * Compares message counts between 3CX database and Supabase archive
 * to verify sync integrity.
 *
 * Usage: npm run verify-sync
 */

import dotenv from "dotenv";
import { logger } from "../src/utils/logger";
import { testConnection, closeConnection } from "../src/threecx/connection";
import { getMessageCount } from "../src/threecx/queries";
import { getSupabaseClient } from "../src/storage/supabase";

dotenv.config();

async function verifySync(): Promise<void> {
  logger.info("=== Sync Verification Script ===");

  try {
    // Test 3CX connection
    await testConnection();

    // Get 3CX message count
    const threecxCount = await getMessageCount();
    logger.info(`3CX database messages: ${threecxCount}`);

    // Get Supabase message count
    const supabase = getSupabaseClient();
    const { count: supabaseCount, error } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true });

    if (error) {
      throw new Error(`Failed to query Supabase: ${error.message}`);
    }

    logger.info(`Supabase archive messages: ${supabaseCount}`);

    // Calculate difference
    const difference = threecxCount - (supabaseCount || 0);
    const syncPercentage =
      threecxCount > 0
        ? (((supabaseCount || 0) / threecxCount) * 100).toFixed(2)
        : 100;

    logger.info("=== Verification Results ===");
    logger.info(`Sync percentage: ${syncPercentage}%`);

    if (difference === 0) {
      logger.info("All messages are synced!");
    } else if (difference > 0) {
      logger.warn(`${difference} messages pending sync`);
    } else {
      logger.warn(`Archive has ${Math.abs(difference)} more messages than 3CX`);
      logger.warn("This may indicate duplicate entries or deleted messages in 3CX");
    }

    // Get additional stats
    const [
      { count: conversationCount },
      { count: mediaCount },
      { count: extensionCount },
    ] = await Promise.all([
      supabase.from("conversations").select("*", { count: "exact", head: true }),
      supabase.from("media_files").select("*", { count: "exact", head: true }),
      supabase.from("extensions").select("*", { count: "exact", head: true }),
    ]);

    logger.info("=== Archive Statistics ===");
    logger.info(`Conversations: ${conversationCount}`);
    logger.info(`Media files: ${mediaCount}`);
    logger.info(`Extensions: ${extensionCount}`);

    // Get sync status
    const { data: syncStatus } = await supabase
      .from("sync_status")
      .select("*")
      .order("sync_type");

    if (syncStatus) {
      logger.info("=== Sync Status ===");
      for (const status of syncStatus) {
        logger.info(
          `${status.sync_type}: ${status.status} (last: ${
            status.last_successful_sync_at || "never"
          })`
        );
      }
    }
  } catch (error) {
    logger.error("Verification failed", { error: (error as Error).message });
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

verifySync();
