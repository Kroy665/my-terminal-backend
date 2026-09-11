import { Router, Response } from "express";
import logger from "../utils/logger";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, AuthRequest } from "../middleware/authMiddleware";
import {
  createSandbox,
  getSandbox,
  listUserSandboxes,
  deleteSandbox,
  extendSandboxTimeout,
  pauseSandbox,
  resumeSandbox,
  writeFileToSandbox,
  readFileFromSandbox,
  listSandboxFiles,
  deleteFileFromSandbox,
  executeCommand,
  updateSandboxSettings,
  relaunchSandbox,
  saveCommandInput,
  saveCommandOutput,
  syncFilesToSandbox
} from "../services/sandboxService";

const router = Router();

/**
 * POST /api/sandboxes
 * Create a new sandbox
 * Body: { name, description?, projectId?, ttl?, template?, envVars?, metadata? }
 */
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, description, projectId, ttl, template, envVars, metadata } =
      req.body;

    console.log("req.body:::", { name, description, projectId, ttl, template, envVars, metadata });

    if (!name || !name.trim()) {
      res.status(400).json({
        error: {
          status: 400,
          code: "MISSING_FIELDS",
          message: "Name is required",
        },
      });
      return;
    }

    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            status: 401,
            code: "UNAUTHORIZED",
            message: "User not authenticated",
          },
        });
        return;
      }

      const sandbox = await createSandbox(req.userId, {
        name,
        description,
        projectId,
        ttl,
        template,
        envVars,
        metadata,
      });

      // Try to sync files to sandbox with retry logic
      // Since e2bSandboxId may not be available immediately, retry up to 7 times with 1 second delay
      if (projectId) {
        const maxRetries = 7;
        const retryDelay = 1000; // 1 second

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            // Wait before each attempt (except the first one)
            if (attempt > 1) {
              await new Promise(resolve => setTimeout(resolve, retryDelay));
            }

            await syncFilesToSandbox(sandbox.id, req.userId, projectId);
            logger.info(`Files synced to sandbox ${sandbox.id} on attempt ${attempt}`);
            break; // Success, exit the retry loop
          } catch (error: any) {
            logger.warn(`File sync attempt ${attempt}/${maxRetries} failed for sandbox ${sandbox.id}:`, error.message);

            // If this was the last attempt, log the failure but don't throw
            if (attempt === maxRetries) {
              logger.error(`Failed to sync files to sandbox ${sandbox.id} after ${maxRetries} attempts`);
            }
          }
        }
      }

      logger.info(`Sandbox created: ${sandbox.id} by user: ${req.email}`);

      res.status(201).json(sandbox);
    } catch (error: any) {
      if (error.status) {
        res.status(error.status).json({
          error: {
            status: error.status,
            code: error.code,
            message: error.message,
          },
        });
      } else {
        throw error;
      }
    }
  })
);

/**
 * GET /api/sandboxes
 * List all sandboxes for the user
 * Query: ?includeTerminated=true
 */
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            status: 401,
            code: "UNAUTHORIZED",
            message: "User not authenticated",
          },
        });
        return;
      }

      const includeTerminated = req.query.includeTerminated === "true";
      const sandboxes = await listUserSandboxes(req.userId, includeTerminated);

      logger.info(
        `Sandboxes retrieved for user: ${req.email} (${sandboxes.length} sandboxes)`
      );

      res.status(200).json({ sandboxes });
    } catch (error: any) {
      if (error.status) {
        res.status(error.status).json({
          error: {
            status: error.status,
            code: error.code,
            message: error.message,
          },
        });
      } else {
        throw error;
      }
    }
  })
);

/**
 * GET /api/sandboxes/:id
 * Get a specific sandbox
 */
router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            status: 401,
            code: "UNAUTHORIZED",
            message: "User not authenticated",
          },
        });
        return;
      }

      const sandbox = await getSandbox(id, req.userId);
      logger.info(`Sandbox retrieved: ${id} by user: ${req.email}`);
      res.status(200).json(sandbox);
    } catch (error: any) {
      if (error.status) {
        res.status(error.status).json({
          error: {
            status: error.status,
            code: error.code,
            message: error.message,
          },
        });
      } else {
        throw error;
      }
    }
  })
);

/**
 * DELETE /api/sandboxes/:id
 * Delete/terminate a sandbox
 */
router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            status: 401,
            code: "UNAUTHORIZED",
            message: "User not authenticated",
          },
        });
        return;
      }

      const result = await deleteSandbox(id, req.userId);

      logger.info(`Sandbox deleted: ${id} by user: ${req.email}`);

      res.status(200).json(result);
    } catch (error: any) {
      if (error.status) {
        res.status(error.status).json({
          error: {
            status: error.status,
            code: error.code,
            message: error.message,
          },
        });
      } else {
        throw error;
      }
    }
  })
);

/**
 * PUT /api/sandboxes/:id/timeout
 * Extend sandbox timeout
 * Body: { additionalSeconds }
 */
router.put(
  "/:id/timeout",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { additionalSeconds } = req.body;

    if (
      !additionalSeconds ||
      typeof additionalSeconds !== "number" ||
      additionalSeconds <= 0
    ) {
      res.status(400).json({
        error: {
          status: 400,
          code: "INVALID_INPUT",
          message: "additionalSeconds must be a positive number",
        },
      });
      return;
    }

    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            status: 401,
            code: "UNAUTHORIZED",
            message: "User not authenticated",
          },
        });
        return;
      }

      const sandbox = await extendSandboxTimeout(
        id,
        req.userId,
        additionalSeconds
      );

      logger.info(
        `Sandbox timeout extended: ${id} by ${additionalSeconds}s by user: ${req.email}`
      );

      res.status(200).json(sandbox);
    } catch (error: any) {
      if (error.status) {
        res.status(error.status).json({
          error: {
            status: error.status,
            code: error.code,
            message: error.message,
          },
        });
      } else {
        throw error;
      }
    }
  })
);

/**
 * POST /api/sandboxes/:id/pause
 * Pause a sandbox
 */
router.post(
  "/:id/pause",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            status: 401,
            code: "UNAUTHORIZED",
            message: "User not authenticated",
          },
        });
        return;
      }

      const sandbox = await pauseSandbox(id, req.userId);

      logger.info(`Sandbox paused: ${id} by user: ${req.email}`);

      res.status(200).json(sandbox);
    } catch (error: any) {
      if (error.status) {
        res.status(error.status).json({
          error: {
            status: error.status,
            code: error.code,
            message: error.message,
          },
        });
      } else {
        throw error;
      }
    }
  })
);

/**
 * POST /api/sandboxes/:id/resume
 * Resume a paused sandbox
 */
router.post(
  "/:id/resume",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            status: 401,
            code: "UNAUTHORIZED",
            message: "User not authenticated",
          },
        });
        return;
      }

      const sandbox = await resumeSandbox(id, req.userId);

      logger.info(`Sandbox resumed: ${id} by user: ${req.email}`);

      res.status(200).json(sandbox);
    } catch (error: any) {
      if (error.status) {
        res.status(error.status).json({
          error: {
            status: error.status,
            code: error.code,
            message: error.message,
          },
        });
      } else {
        throw error;
      }
    }
  })
);

/**
 * POST /api/sandboxes/:id/files
 * Write a file to the sandbox
 * Body: { path, content }
 */
router.post(
  "/:id/files",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { path, content } = req.body;

    if (!path || !content) {
      res.status(400).json({
        error: {
          status: 400,
          code: "MISSING_FIELDS",
          message: "path and content are required",
        },
      });
      return;
    }

    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            status: 401,
            code: "UNAUTHORIZED",
            message: "User not authenticated",
          },
        });
        return;
      }

      const result = await writeFileToSandbox(id, req.userId, {
        path,
        content,
      });

      logger.info(`File written to sandbox ${id}: ${path} by user: ${req.email}`);

      res.status(200).json(result);
    } catch (error: any) {
      if (error.status) {
        res.status(error.status).json({
          error: {
            status: error.status,
            code: error.code,
            message: error.message,
          },
        });
      } else {
        throw error;
      }
    }
  })
);

/**
 * GET /api/sandboxes/:id/files
 * List files in sandbox directory
 * Query: ?path=/some/path (defaults to /)
 */
router.get(
  "/:id/files",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const dirPath = (req.query.path as string) || "/";

    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            status: 401,
            code: "UNAUTHORIZED",
            message: "User not authenticated",
          },
        });
        return;
      }

      const files = await listSandboxFiles(id, req.userId, dirPath);

      logger.info(
        `Files listed in sandbox ${id}: ${dirPath} by user: ${req.email}`
      );

      res.status(200).json({ files, path: dirPath });
    } catch (error: any) {
      if (error.status) {
        res.status(error.status).json({
          error: {
            status: error.status,
            code: error.code,
            message: error.message,
          },
        });
      } else {
        throw error;
      }
    }
  })
);

/**
 * GET /api/sandboxes/:id/files/read
 * Read a file from the sandbox
 * Query: ?path=/path/to/file
 */
router.get(
  "/:id/files/read",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const filePath = req.query.path as string;

    if (!filePath) {
      res.status(400).json({
        error: {
          status: 400,
          code: "MISSING_FIELDS",
          message: "path query parameter is required",
        },
      });
      return;
    }

    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            status: 401,
            code: "UNAUTHORIZED",
            message: "User not authenticated",
          },
        });
        return;
      }

      const result = await readFileFromSandbox(id, req.userId, filePath);

      logger.info(
        `File read from sandbox ${id}: ${filePath} by user: ${req.email}`
      );

      res.status(200).json(result);
    } catch (error: any) {
      if (error.status) {
        res.status(error.status).json({
          error: {
            status: error.status,
            code: error.code,
            message: error.message,
          },
        });
      } else {
        throw error;
      }
    }
  })
);

/**
 * DELETE /api/sandboxes/:id/files
 * Delete a file from the sandbox
 * Query: ?path=/path/to/file
 */
router.delete(
  "/:id/files",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const filePath = req.query.path as string;

    if (!filePath) {
      res.status(400).json({
        error: {
          status: 400,
          code: "MISSING_FIELDS",
          message: "path query parameter is required",
        },
      });
      return;
    }

    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            status: 401,
            code: "UNAUTHORIZED",
            message: "User not authenticated",
          },
        });
        return;
      }

      const result = await deleteFileFromSandbox(id, req.userId, filePath);

      logger.info(
        `File deleted from sandbox ${id}: ${filePath} by user: ${req.email}`
      );

      res.status(200).json(result);
    } catch (error: any) {
      if (error.status) {
        res.status(error.status).json({
          error: {
            status: error.status,
            code: error.code,
            message: error.message,
          },
        });
      } else {
        throw error;
      }
    }
  })
);


/**
 * POST /api/sandboxes/:id/sync-files
 * Sync File from db to e2b sandbox
 * Body: { projectId }
 */
router.post(
  "/:id/sync-files",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { projectId } = req.body;

    if(!projectId) {
      res.status(400).json({
        error: {
          status: 400,
          code: "MISSING_FIELDS",
          message: "projectId is required",
        },
      });
      return;
    }

    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            status: 401,
            code: "UNAUTHORIZED",
            message: "User not authenticated",
          },
        });
        return;
      }

      const result = await syncFilesToSandbox(id, req.userId, projectId);

      logger.info(
        `Files synced to sandbox ${id}: ${projectId} by user: ${req.email}`
      );

      res.status(200).json(result);
    } catch (error: any) {
      if (error.status) {
        res.status(error.status).json({
          error: {
            status: error.status,
            code: error.code,
            message: error.message,
          },
        });
      } else {
        throw error;
      }
    }
  })
)


/**
 * POST /api/sandboxes/:id/commands
 * Execute a command in the sandbox
 * Body: { command, workdir?, timeout? }
 */
router.post(
  "/:id/commands",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { command, workdir, timeout } = req.body;

    if (!command) {
      res.status(400).json({
        error: {
          status: 400,
          code: "MISSING_FIELDS",
          message: "command is required",
        },
      });
      return;
    }

    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            status: 401,
            code: "UNAUTHORIZED",
            message: "User not authenticated",
          },
        });
        return;
      }

      // save the command in db
      const savedCommand = await saveCommandInput(id, req.userId, {
        command,
        workdir,
        timeout,
      });

      const result = await executeCommand(id, req.userId, {
        command,
        workdir,
        timeout,
      });

      // save the command output in db
      await saveCommandOutput(id, req.userId, savedCommand.id, {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        error: result.error,
      });

      logger.info(
        `Command executed in sandbox ${id}: ${command} by user: ${req.email}`
      );

      res.status(200).json(result);
    } catch (error: any) {
      if (error.status) {
        res.status(error.status).json({
          error: {
            status: error.status,
            code: error.code,
            message: error.message,
          },
        });
      } else {
        throw error;
      }
    }
  })
);

/**
 * PUT /api/sandboxes/:id/settings
 * Update sandbox settings
 * Body: { template?, envVars?, metadata? }
 */
router.put(
  "/:id/settings",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { template, envVars, metadata } = req.body;

    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            status: 401,
            code: "UNAUTHORIZED",
            message: "User not authenticated",
          },
        });
        return;
      }

      const sandbox = await updateSandboxSettings(id, req.userId, {
        template,
        envVars,
        metadata,
      });

      logger.info(`Sandbox settings updated: ${id} by user: ${req.email}`);

      res.status(200).json(sandbox);
    } catch (error: any) {
      if (error.status) {
        res.status(error.status).json({
          error: {
            status: error.status,
            code: error.code,
            message: error.message,
          },
        });
      } else {
        throw error;
      }
    }
  })
);

/**
 * POST /api/sandboxes/:id/relaunch
 * Relaunch sandbox with saved settings
 */
router.post(
  "/:id/relaunch",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            status: 401,
            code: "UNAUTHORIZED",
            message: "User not authenticated",
          },
        });
        return;
      }

      const newSandbox = await relaunchSandbox(id, req.userId);

      logger.info(
        `Sandbox relaunched: ${id} -> ${newSandbox.id} by user: ${req.email}`
      );

      res.status(201).json(newSandbox);
    } catch (error: any) {
      if (error.status) {
        res.status(error.status).json({
          error: {
            status: error.status,
            code: error.code,
            message: error.message,
          },
        });
      } else {
        throw error;
      }
    }
  })
);

export default router;

