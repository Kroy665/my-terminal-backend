import { Command, PrismaClient, Sandbox, SandboxStatus } from "@prisma/client";
import { Sandbox as E2BSandbox } from "e2b";
import logger from "../utils/logger";
import { getFileContent, getProjectTree, NodeResponse } from "./contentService";

const prisma = new PrismaClient();

// Configuration from environment
const SANDBOX_MAX_PER_USER = parseInt(process.env.SANDBOX_MAX_PER_USER || "5");
const SANDBOX_DEFAULT_TTL = parseInt(process.env.SANDBOX_DEFAULT_TTL || "3600"); // 1 hour
const SANDBOX_MAX_TTL = parseInt(process.env.SANDBOX_MAX_TTL || "86400"); // 24 hours

// Types and Interfaces
export interface CreateSandboxRequest {
  name: string;
  description?: string;
  projectId?: string;
  ttl?: number; // Time to live in seconds
  template?: string; // E2B template ID
  envVars?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface SandboxResponse {
  id: string;
  name: string;
  description?: string;
  e2bSandboxId?: string;
  status: SandboxStatus;
  userId: string;
  projectId?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  lastAccessedAt: Date;
  ttl: number;
  settings?: any;
  metadata?: any;
  commands: Command[];
}

export interface UpdateSandboxSettingsRequest {
  template?: string;
  envVars?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface WriteFileRequest {
  path: string;
  content: string;
}

export interface ExecuteCommandRequest {
  command: string;
  workdir?: string;
  timeout?: number;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
}

// Active E2B sandboxes cache (in-memory)
// Maps our sandbox ID to E2B Sandbox instance
const activeSandboxes = new Map<string, E2BSandbox>();

/**
 * Validate user can create more sandboxes
 */
async function validateUserLimits(userId: string): Promise<void> {
  const activeSandboxCount = await prisma.sandbox.count({
    where: {
      userId,
      status: {
        in: [SandboxStatus.CREATING, SandboxStatus.ACTIVE, SandboxStatus.PAUSED],
      },
    },
  });

  if (activeSandboxCount >= SANDBOX_MAX_PER_USER) {
    const error = new Error(
      `Maximum sandbox limit reached (${SANDBOX_MAX_PER_USER}). Please delete existing sandboxes.`
    );
    (error as any).status = 429;
    (error as any).code = "SANDBOX_LIMIT_REACHED";
    throw error;
  }
}

/**
 * Get or create E2B sandbox instance
 */
async function getE2BSandbox(
  sandboxId: string,
  e2bSandboxId?: string,
  template?: string
): Promise<E2BSandbox> {
  // Check cache first
  if (activeSandboxes.has(sandboxId)) {
    return activeSandboxes.get(sandboxId)!;
  }

  // Create or connect to E2B sandbox
  let e2bSandbox: E2BSandbox;

  if (e2bSandboxId) {
    // Connect to existing E2B sandbox
    try {
      e2bSandbox = await E2BSandbox.connect(e2bSandboxId, {
        apiKey: process.env.E2B_API_KEY,
      });
      logger.info(`Connected to existing E2B sandbox: ${e2bSandboxId}`);
    } catch (error) {
      logger.error(`Failed to connect to E2B sandbox ${e2bSandboxId}:`, error);
      throw new Error("Failed to connect to sandbox");
    }
  } else {
    // Create new E2B sandbox
    try {
      const createOptions: any = {
        apiKey: process.env.E2B_API_KEY,
        timeoutMs: SANDBOX_DEFAULT_TTL * 1000,
      };

      if (template) {
        createOptions.template = template;
      }

      e2bSandbox = await E2BSandbox.create(createOptions);
      logger.info(`Created new E2B sandbox: ${e2bSandbox.sandboxId}`);

      // Update database with E2B sandbox ID
      await prisma.sandbox.update({
        where: { id: sandboxId },
        data: {
          e2bSandboxId: e2bSandbox.sandboxId,
          status: SandboxStatus.ACTIVE,
        },
      });
    } catch (error) {
      logger.error("Failed to create E2B sandbox:", error);
      // Mark as failed in database
      await prisma.sandbox.update({
        where: { id: sandboxId },
        data: { status: SandboxStatus.FAILED },
      });
      throw new Error("Failed to create sandbox");
    }
  }

  // Cache the instance
  activeSandboxes.set(sandboxId, e2bSandbox);

  return e2bSandbox;
}

/**
 * Verify sandbox ownership
 */
async function verifySandboxOwnership(
  sandboxId: string,
  userId: string
): Promise<Sandbox> {
  const sandbox = await prisma.sandbox.findUnique({
    where: { id: sandboxId },
  });

  if (!sandbox) {
    const error = new Error("Sandbox not found");
    (error as any).status = 404;
    (error as any).code = "SANDBOX_NOT_FOUND";
    throw error;
  }

  if (sandbox.userId !== userId) {
    const error = new Error("Unauthorized to access this sandbox");
    (error as any).status = 403;
    (error as any).code = "FORBIDDEN";
    throw error;
  }

  return sandbox;
}

/**
 * Create a new sandbox
 */
export async function createSandbox(
  userId: string,
  data: CreateSandboxRequest
): Promise<SandboxResponse> {
  try {
    // Validate user limits
    await validateUserLimits(userId);

    // Validate TTL
    const ttl = Math.min(data.ttl || SANDBOX_DEFAULT_TTL, SANDBOX_MAX_TTL);

    // Validate project if provided
    if (data.projectId) {
      const project = await prisma.project.findUnique({
        where: { id: data.projectId },
      });

      if (!project || project.userId !== userId) {
        const error = new Error("Project not found or unauthorized");
        (error as any).status = 404;
        (error as any).code = "PROJECT_NOT_FOUND";
        throw error;
      }
    }

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + ttl * 1000);

    // Prepare settings
    const settings: any = {};
    if (data.template) settings.template = data.template;
    if (data.envVars) settings.envVars = data.envVars;

    // Create sandbox record
    const sandbox = await prisma.sandbox.create({
      data: {
        name: data.name,
        description: data.description,
        userId,
        projectId: data.projectId,
        ttl,
        expiresAt,
        status: SandboxStatus.CREATING,
        settings: Object.keys(settings).length > 0 ? settings : undefined,
        metadata: data.metadata,
      },
      include: {
        commands: true
      }
    });

    // Create E2B sandbox asynchronously
    getE2BSandbox(sandbox.id, undefined, data.template).catch((err) => {
      logger.error(`Failed to initialize E2B sandbox for ${sandbox.id}:`, err);
    });

    logger.info(`Sandbox created: ${sandbox.id} for user: ${userId}`);

    return sandbox as SandboxResponse;
  } catch (error) {
    logger.error("Error creating sandbox:", error);
    throw error;
  }
}

/**
 * Get sandbox by ID
 */
export async function getSandbox(
  sandboxId: string,
  userId: string
): Promise<SandboxResponse> {
  try {
    const sandbox = await verifySandboxOwnership(sandboxId, userId);

    // Update last accessed time
    const updatedSandbox = await prisma.sandbox.update({
      where: { id: sandboxId },
      data: { lastAccessedAt: new Date() },
      include: {
        commands: true
      }
    });

    return updatedSandbox as SandboxResponse;
  } catch (error) {
    logger.error("Error fetching sandbox:", error);
    throw error;
  }
}

/**
 * List all sandboxes for a user
 */
export async function listUserSandboxes(
  userId: string,
  includeTerminated: boolean = false
): Promise<SandboxResponse[]> {
  try {
    const whereClause: any = { userId };

    if (!includeTerminated) {
      whereClause.status = {
        not: SandboxStatus.TERMINATED,
      };
    }

    const sandboxes = await prisma.sandbox.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        commands: true
      }
    });

    return sandboxes as SandboxResponse[];
  } catch (error) {
    logger.error("Error listing sandboxes:", error);
    throw error;
  }
}

/**
 * Delete/kill a sandbox
 */
export async function deleteSandbox(
  sandboxId: string,
  userId: string
): Promise<{ message: string }> {
  try {
    const sandbox = await verifySandboxOwnership(sandboxId, userId);

    // Kill E2B sandbox if it exists
    if (sandbox.e2bSandboxId) {
      const e2bSandbox = activeSandboxes.get(sandboxId);
      if (e2bSandbox) {
        await e2bSandbox.kill();
        activeSandboxes.delete(sandboxId);
        logger.info(`Killed E2B sandbox: ${sandbox.e2bSandboxId}`);
      }
    }

    // Update database status
    await prisma.sandbox.update({
      where: { id: sandboxId },
      data: { status: SandboxStatus.TERMINATED },
    });

    logger.info(`Sandbox terminated: ${sandboxId} by user: ${userId}`);

    return { message: "Sandbox terminated successfully" };
  } catch (error) {
    logger.error("Error deleting sandbox:", error);
    throw error;
  }
}

/**
 * Extend sandbox timeout
 */
export async function extendSandboxTimeout(
  sandboxId: string,
  userId: string,
  additionalSeconds: number
): Promise<SandboxResponse> {
  try {
    const sandbox = await verifySandboxOwnership(sandboxId, userId);

    if (sandbox.status === SandboxStatus.TERMINATED) {
      const error = new Error("Cannot extend timeout for terminated sandbox");
      (error as any).status = 400;
      (error as any).code = "SANDBOX_TERMINATED";
      throw error;
    }

    // Calculate new expiration (capped at max TTL from now)
    const maxNewExpiration = new Date(Date.now() + SANDBOX_MAX_TTL * 1000);
    const requestedExpiration = new Date(
      sandbox.expiresAt.getTime() + additionalSeconds * 1000
    );
    const newExpiresAt =
      requestedExpiration < maxNewExpiration
        ? requestedExpiration
        : maxNewExpiration;

    // Update E2B sandbox timeout if it exists
    if (sandbox.e2bSandboxId) {
      const e2bSandbox = await getE2BSandbox(sandboxId, sandbox.e2bSandboxId);
      const timeoutSeconds = Math.floor(
        (newExpiresAt.getTime() - Date.now()) / 1000
      );
      await e2bSandbox.setTimeout(timeoutSeconds);
    }

    // Update database
    const updatedSandbox = await prisma.sandbox.update({
      where: { id: sandboxId },
      data: { expiresAt: newExpiresAt, lastAccessedAt: new Date() },
      include: {
        commands: true
      }
    });

    logger.info(`Sandbox timeout extended: ${sandboxId}`);

    return updatedSandbox as SandboxResponse;
  } catch (error) {
    logger.error("Error extending sandbox timeout:", error);
    throw error;
  }
}

/**
 * Pause a sandbox
 */
export async function pauseSandbox(
  sandboxId: string,
  userId: string
): Promise<SandboxResponse> {
  try {
    const sandbox = await verifySandboxOwnership(sandboxId, userId);

    if (sandbox.status !== SandboxStatus.ACTIVE) {
      const error = new Error("Only active sandboxes can be paused");
      (error as any).status = 400;
      (error as any).code = "INVALID_STATUS";
      throw error;
    }

    // Note: E2B may not support pause directly, we'll just update our status
    // and keep the E2B sandbox running but mark it as paused in our system

    const updatedSandbox = await prisma.sandbox.update({
      where: { id: sandboxId },
      data: { status: SandboxStatus.PAUSED, lastAccessedAt: new Date() },
      include: {
        commands: true
      }
    });

    logger.info(`Sandbox paused: ${sandboxId}`);

    return updatedSandbox as SandboxResponse;
  } catch (error) {
    logger.error("Error pausing sandbox:", error);
    throw error;
  }
}

/**
 * Resume a paused sandbox
 */
export async function resumeSandbox(
  sandboxId: string,
  userId: string
): Promise<SandboxResponse> {
  try {
    const sandbox = await verifySandboxOwnership(sandboxId, userId);

    if (sandbox.status !== SandboxStatus.PAUSED) {
      const error = new Error("Only paused sandboxes can be resumed");
      (error as any).status = 400;
      (error as any).code = "INVALID_STATUS";
      throw error;
    }

    const updatedSandbox = await prisma.sandbox.update({
      where: { id: sandboxId },
      data: { status: SandboxStatus.ACTIVE, lastAccessedAt: new Date() },
      include: {
        commands: true
      }
    });

    logger.info(`Sandbox resumed: ${sandboxId}`);

    return updatedSandbox as SandboxResponse;
  } catch (error) {
    logger.error("Error resuming sandbox:", error);
    throw error;
  }
}

/**
 * Write a file to sandbox
 */
export async function writeFileToSandbox(
  sandboxId: string,
  userId: string,
  data: WriteFileRequest
): Promise<{ message: string }> {
  try {
    const sandbox = await verifySandboxOwnership(sandboxId, userId);

    if (!sandbox.e2bSandboxId) {
      const error = new Error("Sandbox not fully initialized");
      (error as any).status = 400;
      (error as any).code = "SANDBOX_NOT_READY";
      throw error;
    }

    const e2bSandbox = await getE2BSandbox(sandboxId, sandbox.e2bSandboxId);

    // Write file using E2B filesystem API
    await e2bSandbox.files.write(data.path, data.content);

    // Update last accessed time
    await prisma.sandbox.update({
      where: { id: sandboxId },
      data: { lastAccessedAt: new Date() },
    });

    logger.info(`File written to sandbox ${sandboxId}: ${data.path}`);

    return { message: "File written successfully" };
  } catch (error) {
    logger.error("Error writing file to sandbox:", error);
    throw error;
  }
}

/**
 * Read a file from sandbox
 */
export async function readFileFromSandbox(
  sandboxId: string,
  userId: string,
  filePath: string
): Promise<{ content: string; path: string }> {
  try {
    const sandbox = await verifySandboxOwnership(sandboxId, userId);

    if (!sandbox.e2bSandboxId) {
      const error = new Error("Sandbox not fully initialized");
      (error as any).status = 400;
      (error as any).code = "SANDBOX_NOT_READY";
      throw error;
    }

    const e2bSandbox = await getE2BSandbox(sandboxId, sandbox.e2bSandboxId);

    // Read file using E2B filesystem API
    const content = await e2bSandbox.files.read(filePath);

    // Update last accessed time
    await prisma.sandbox.update({
      where: { id: sandboxId },
      data: { lastAccessedAt: new Date() },
    });

    logger.info(`File read from sandbox ${sandboxId}: ${filePath}`);

    return { content, path: filePath };
  } catch (error) {
    logger.error("Error reading file from sandbox:", error);
    throw error;
  }
}

/**
 * List files in sandbox directory
 */
export async function listSandboxFiles(
  sandboxId: string,
  userId: string,
  dirPath: string = "/"
): Promise<Array<{ name: string; type: string; path: string }>> {
  try {
    const sandbox = await verifySandboxOwnership(sandboxId, userId);

    if (!sandbox.e2bSandboxId) {
      const error = new Error("Sandbox not fully initialized");
      (error as any).status = 400;
      (error as any).code = "SANDBOX_NOT_READY";
      throw error;
    }

    const e2bSandbox = await getE2BSandbox(sandboxId, sandbox.e2bSandboxId);

    // List directory contents
    const files = await e2bSandbox.files.list(dirPath);

    // Update last accessed time
    await prisma.sandbox.update({
      where: { id: sandboxId },
      data: { lastAccessedAt: new Date() },
    });

    logger.info(`Files listed in sandbox ${sandboxId}: ${dirPath}`);

    return files.map((file) => ({
      name: file.name,
      type: file.type || "unknown",
      path: `${dirPath}/${file.name}`.replace("//", "/"),
    }));
  } catch (error) {
    logger.error("Error listing sandbox files:", error);
    throw error;
  }
}

/**
 * Delete a file from sandbox
 */
export async function deleteFileFromSandbox(
  sandboxId: string,
  userId: string,
  filePath: string
): Promise<{ message: string }> {
  try {
    const sandbox = await verifySandboxOwnership(sandboxId, userId);

    if (!sandbox.e2bSandboxId) {
      const error = new Error("Sandbox not fully initialized");
      (error as any).status = 400;
      (error as any).code = "SANDBOX_NOT_READY";
      throw error;
    }

    const e2bSandbox = await getE2BSandbox(sandboxId, sandbox.e2bSandboxId);

    // Remove file using E2B filesystem API
    await e2bSandbox.files.remove(filePath);

    // Update last accessed time
    await prisma.sandbox.update({
      where: { id: sandboxId },
      data: { lastAccessedAt: new Date() },
    });

    logger.info(`File deleted from sandbox ${sandboxId}: ${filePath}`);

    return { message: "File deleted successfully" };
  } catch (error) {
    logger.error("Error deleting file from sandbox:", error);
    throw error;
  }
}

/**
 * Execute a command in sandbox
 */
export async function executeCommand(
  sandboxId: string,
  userId: string,
  data: ExecuteCommandRequest
): Promise<CommandResult> {
  try {
    const sandbox = await verifySandboxOwnership(sandboxId, userId);

    if (!sandbox.e2bSandboxId) {
      const error = new Error("Sandbox not fully initialized");
      (error as any).status = 400;
      (error as any).code = "SANDBOX_NOT_READY";
      throw error;
    }

    const e2bSandbox = await getE2BSandbox(sandboxId, sandbox.e2bSandboxId);

    // Execute command using commands API
    const cmdResult = await e2bSandbox.commands.run(data.command, {
      cwd: data.workdir,
    });

    console.log("cmdResult json:::", JSON.stringify(cmdResult, null, 2))

    // Get output
    const stdout = cmdResult.stdout;
    const stderr = cmdResult.stderr;
    const exitCode = cmdResult.exitCode;

    // Update last accessed time
    await prisma.sandbox.update({
      where: { id: sandboxId },
      data: { lastAccessedAt: new Date() },
    });

    logger.info(
      `Command executed in sandbox ${sandboxId}: ${data.command} (exit code: ${exitCode})`
    );

    return {
      stdout,
      stderr,
      exitCode,
      error: exitCode !== 0 ? stderr : undefined,
    };
  } catch (error) {
    logger.error("Error executing command in sandbox:", error);
    throw error;
  }
}

/**
 * Save command
 */
export async function saveCommandInput(
  sandboxId: string,
  userId: string,
  data: ExecuteCommandRequest
): Promise<Command> {
  try {
    const sandbox = await verifySandboxOwnership(sandboxId, userId);

    if (!sandbox.e2bSandboxId) {
      const error = new Error("Sandbox not fully initialized");
      (error as any).status = 400;
      (error as any).code = "SANDBOX_NOT_READY";
      throw error;
    }

    const command = await prisma.command.create({
      data: {
        sandboxId: sandboxId,
        command: data.command,
        workdir: data.workdir,
        timeout: data.timeout,
      },
    });

    logger.info(`Command saved: ${command.id}`);

    return command;
  } catch (error) {
    logger.error("Error saving command:", error);
    throw error;
  }
}

/**
 * Save command output
 */
export async function saveCommandOutput(
  sandboxId: string,
  userId: string,
  commandId: string,
  data: CommandResult
): Promise<Command> {
  try {
    const sandbox = await verifySandboxOwnership(sandboxId, userId);

    if (!sandbox.e2bSandboxId) {
      const error = new Error("Sandbox not fully initialized");
      (error as any).status = 400;
      (error as any).code = "SANDBOX_NOT_READY";
      throw error;
    }

    const command = await prisma.command.update({
      where: { id: commandId },
      data: {
        stdout: data.stdout,
        stderr: data.stderr,
        exitCode: data.exitCode,
        error: data.error,
      },
    });

    logger.info(`Command output saved: ${command.id}`);

    return command;
  } catch (error) {
    logger.error("Error saving command output:", error);
    throw error;
  }
}

/**
 * Update sandbox settings
 */
export async function updateSandboxSettings(
  sandboxId: string,
  userId: string,
  settings: UpdateSandboxSettingsRequest
): Promise<SandboxResponse> {
  try {
    const sandbox = await verifySandboxOwnership(sandboxId, userId);

    // Merge with existing settings
    const currentSettings = (sandbox.settings as any) || {};
    const newSettings = { ...currentSettings, ...settings };

    const updatedSandbox = await prisma.sandbox.update({
      where: { id: sandboxId },
      data: {
        settings: newSettings,
        metadata: settings?.metadata || sandbox?.metadata || undefined,
        lastAccessedAt: new Date(),
      },
      include: {
        commands: true
      }
    });

    logger.info(`Sandbox settings updated: ${sandboxId}`);

    return updatedSandbox as SandboxResponse;
  } catch (error) {
    logger.error("Error updating sandbox settings:", error);
    throw error;
  }
}

/**
 * Relaunch sandbox with saved settings
 */
export async function relaunchSandbox(
  sandboxId: string,
  userId: string
): Promise<SandboxResponse> {
  try {
    const oldSandbox = await verifySandboxOwnership(sandboxId, userId);

    // Create new sandbox with same settings
    const settings = (oldSandbox.settings as any) || {};

    const newSandbox = await createSandbox(userId, {
      name: `${oldSandbox.name} (Relaunched)`,
      description: oldSandbox.description || undefined,
      projectId: oldSandbox.projectId || undefined,
      ttl: oldSandbox.ttl,
      template: settings.template,
      envVars: settings.envVars,
      metadata: oldSandbox.metadata as any,
    });

    logger.info(`Sandbox relaunched: ${sandboxId} -> ${newSandbox.id}`);

    return newSandbox;
  } catch (error) {
    logger.error("Error relaunching sandbox:", error);
    throw error;
  }
}

/**
 * Cleanup expired sandboxes (should be called by a scheduler)
 */
export async function cleanupExpiredSandboxes(): Promise<{
  cleaned: number;
}> {
  try {
    const now = new Date();

    // Find expired sandboxes
    const expiredSandboxes = await prisma.sandbox.findMany({
      where: {
        expiresAt: { lte: now },
        status: {
          not: SandboxStatus.TERMINATED,
        },
      },
    });

    let cleanedCount = 0;

    for (const sandbox of expiredSandboxes) {
      try {
        // Kill E2B sandbox if it exists
        if (sandbox.e2bSandboxId) {
          const e2bSandbox = activeSandboxes.get(sandbox.id);
          if (e2bSandbox) {
            await e2bSandbox.kill();
            activeSandboxes.delete(sandbox.id);
          }
        }

        // Update status to terminated
        await prisma.sandbox.update({
          where: { id: sandbox.id },
          data: { status: SandboxStatus.TERMINATED },
        });

        cleanedCount++;
        logger.info(`Cleaned up expired sandbox: ${sandbox.id}`);
      } catch (err) {
        logger.error(`Failed to cleanup sandbox ${sandbox.id}:`, err);
      }
    }

    logger.info(`Cleaned up ${cleanedCount} expired sandboxes`);

    return { cleaned: cleanedCount };
  } catch (error) {
    logger.error("Error cleaning up expired sandboxes:", error);
    throw error;
  }
}

/**
 * Sync files to sandbox
 * 
 */
export async function syncFilesToSandbox(
  sandboxId: string, 
  userId: string, 
  projectId: string
) {
  try {
    const oldSandbox = await verifySandboxOwnership(sandboxId, userId);

    if (!oldSandbox.e2bSandboxId) {
      const error = new Error("Sandbox not fully initialized");
      (error as any).status = 400;
      (error as any).code = "SANDBOX_NOT_READY";
      throw error;
    }

    if(oldSandbox.status !== SandboxStatus.ACTIVE) {
      const error = new Error("Sandbox not active");
      (error as any).status = 400;
      (error as any).code = "SANDBOX_NOT_ACTIVE";
      throw error;
    }

    const e2bSandbox = await getE2BSandbox(sandboxId, oldSandbox.e2bSandboxId);
    
    if (!e2bSandbox) {
      const error = new Error("E2B sandbox not found");
      (error as any).status = 404;
      (error as any).code = "E2B_SANDBOX_NOT_FOUND";
      throw error;
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    const projectPath = project?.name.replace(" ", "_").toLowerCase();

    if (!project) {
      const error = new Error("Project not found");
      (error as any).status = 404;
      (error as any).code = "PROJECT_NOT_FOUND";
      throw error;
    }

    const projectTree = await getProjectTree(projectId, userId);

    // flatten the project tree
    const files = await flattenProjectTree(projectTree, userId);

    // sync files to sandbox
    for (const file of files) {
      await writeFileToSandbox(sandboxId, userId, {
        path: `/home/user/${projectPath}/${file.path}`,
        content: file?.code || "",
      });
    }

    return files;
  } catch (error) {
    logger.error("Error syncing files to sandbox:", error);
    throw error;
  }
}

interface File {
  name: string;
  path: string;
  mimeType?: string;
  code?: string;
  parentId?: string;
}

async function flattenProjectTree(tree: NodeResponse[], userId: string): Promise<File[]> {
  const files: File[] = [];
  for (const node of tree) {
    if (node.type === "FILE") {
      const content = await getFileContent(node.id, userId)
      files.push({
        name: node.name,
        path: node.path,
        mimeType: node?.mimeType || undefined,
        code: "",
        parentId: node?.parentId || undefined,
      });
    } else {
      if (node.children) {
        files.push(...(await flattenProjectTree(node.children, userId)));
      }
    }
  }
  return files;
}
