/**
 * Initial Sync Script
 *
 * Run this script once to perform a full initial sync of all historical data.
 * This may take a long time depending on the amount of data.
 *
 * Usage: npm run initial-sync
 */

import dotenv from "dotenv";
import { logger } from "../src/utils/logger";
import { testConnection, closeConnection } from "../src/threecx/connection";
import { getMessageCount } from "../src/threecx/queries";
import { runFullSync } from "../src/sync";

dotenv.config();

async function initialSync(): Promise<void> {
  logger.info("=== Initial Sync Script ===");

  try {
    // Test connection
    await testConnection();

    // Get total message count
    const totalMessages = await getMessageCount();
    logger.info(`Total messages in 3CX database: ${totalMessages}`);

    // Estimate time
    const batchSize = parseInt(process.env.SYNC_BATCH_SIZE || "100");
    const estimatedBatches = Math.ceil(totalMessages / batchSize);
    logger.info(
      `Estimated batches: ${estimatedBatches} (batch size: ${batchSize})`
    );

    // Confirm before proceeding
    logger.info("Starting initial sync in 5 seconds...");
    logger.info("Press Ctrl+C to cancel");

    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Run full sync with larger batch size for initial sync
    const startTime = Date.now();
    let totalSynced = 0;
    let batchNumber = 0;

    // Keep syncing until no more messages
    while (true) {
      batchNumber++;
      logger.info(`Processing batch ${batchNumber}...`);

      const result = await runFullSync({
        skipMedia: false,
        skipExtensions: batchNumber === 1, // Only sync extensions on first batch
        batchSize: 500, // Larger batch for initial sync
      });

      totalSynced += result.messages.messagesSynced;

      logger.info(`Batch ${batchNumber} complete`, {
        messagesSynced: result.messages.messagesSynced,
        totalSynced,
      });

      // If we got less than batch size, we're done
      if (result.messages.messagesSynced < 500) {
        break;
      }

      // Add a small delay between batches
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const duration = Date.now() - startTime;
    logger.info("=== Initial Sync Complete ===", {
      totalMessagesSynced: totalSynced,
      totalBatches: batchNumber,
      duration: `${Math.round(duration / 1000)}s`,
    });
  } catch (error) {
    logger.error("Initial sync failed", { error: (error as Error).message });
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

initialSync();
