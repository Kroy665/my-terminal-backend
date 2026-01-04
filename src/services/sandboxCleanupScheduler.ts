import { cleanupExpiredSandboxes } from "./sandboxService";
import logger from "../utils/logger";

// Cleanup interval in milliseconds (default: 1 minute)
const CLEANUP_INTERVAL_MS = parseInt(
  process.env.SANDBOX_CLEANUP_INTERVAL || "60000"
);

/**
 * Start the sandbox cleanup scheduler
 * This runs periodically to terminate expired sandboxes
 */
export function startSandboxCleanupScheduler(): NodeJS.Timeout {
  logger.info(
    `Starting sandbox cleanup scheduler (interval: ${CLEANUP_INTERVAL_MS / 1000}s)`
  );

  const intervalId = setInterval(async () => {
    try {
      logger.debug("Running sandbox cleanup...");
      const result = await cleanupExpiredSandboxes();

      if (result.cleaned > 0) {
        logger.info(`Sandbox cleanup completed: ${result.cleaned} sandboxes terminated`);
      } else {
        logger.debug("Sandbox cleanup completed: no expired sandboxes found");
      }
    } catch (error) {
      logger.error("Error during sandbox cleanup:", error);
    }
  }, CLEANUP_INTERVAL_MS);

  // Run immediately on startup
  cleanupExpiredSandboxes()
    .then((result) => {
      if (result.cleaned > 0) {
        logger.info(
          `Initial sandbox cleanup: ${result.cleaned} sandboxes terminated`
        );
      }
    })
    .catch((error) => {
      logger.error("Error during initial sandbox cleanup:", error);
    });

  return intervalId;
}

/**
 * Stop the sandbox cleanup scheduler
 */
export function stopSandboxCleanupScheduler(
  intervalId: NodeJS.Timeout
): void {
  logger.info("Stopping sandbox cleanup scheduler");
  clearInterval(intervalId);
}
