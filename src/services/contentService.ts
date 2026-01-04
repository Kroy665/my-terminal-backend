import { PrismaClient, NodeType, StorageType } from "@prisma/client";
import logger from "../utils/logger";
import crypto from "crypto";
import { buildTree } from "../utils/buildTree";

const prisma = new PrismaClient();

// Types and Interfaces
export interface CreateFileRequest {
  name: string;
  path: string; // Full path from project root (e.g., "src/index.ts")
  mimeType?: string;
  code: string;
  parentId?: string;
}

export interface CreateDirectoryRequest {
  name: string;
  path: string;
  parentId?: string;
}

export interface UpdateFileContentRequest {
  code: string;
}

export interface UpdateNodeMetadataRequest {
  metadata?: Record<string, any>;
}

export interface NodeResponse {
  id: string;
  name: string;
  type: NodeType;
  path: string;
  size?: number | null;
  mimeType?: string | null;
  parentId?: string | null;
  projectId: string;
  metadata?: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
  children?: NodeResponse[];
}

export interface FileContentResponse {
  id: string;
  code: string;
  encoding?: string | null;
  contentHash?: string | null;
  storageType?: StorageType | null;
  storageUrl?: string | null;
}

// Utility functions
function calculateHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Create a file in a project
 */
export async function createFile(
  projectId: string,
  userId: string,
  data: CreateFileRequest,
): Promise<NodeResponse> {
  try {
    // Verify project ownership
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project || project.userId !== userId) {
      const error = new Error("Unauthorized to access this project");
      (error as any).status = 403;
      (error as any).code = "FORBIDDEN";
      throw error;
    }

    // Check if file already exists at this path
    const existing = await prisma.node.findUnique({
      where: {
        projectId_path: {
          projectId,
          path: data.path,
        },
      },
    });

    if (existing) {
      const error = new Error("File already exists at this path");
      (error as any).status = 409;
      (error as any).code = "FILE_EXISTS";
      throw error;
    }

    // Normalize parentId (empty string should be treated as null)
    const parentId = data.parentId && data.parentId.trim() ? data.parentId : null;

    // Validate parent if provided
    if (parentId) {
      const parent = await prisma.node.findUnique({
        where: { id: parentId },
      });

      if (!parent) {
        const error = new Error("Parent node not found");
        (error as any).status = 404;
        (error as any).code = "PARENT_NOT_FOUND";
        throw error;
      }

      if (parent.projectId !== projectId) {
        const error = new Error("Parent node does not belong to this project");
        (error as any).status = 400;
        (error as any).code = "INVALID_PARENT_PROJECT";
        throw error;
      }

      if (parent.type !== NodeType.DIRECTORY) {
        const error = new Error("Parent node must be a directory");
        (error as any).status = 400;
        (error as any).code = "INVALID_PARENT_TYPE";
        throw error;
      }
    }

    // Create the file node
    const node = await prisma.node.create({
      data: {
        name: data.name,
        type: NodeType.FILE,
        path: data.path,
        mimeType: data.mimeType || "text/plain",
        size: data.code.length,
        projectId,
        parentId,
      },
    });

    // Create file content
    const contentHash = calculateHash(data.code);
    await prisma.fileContent.create({
      data: {
        nodeId: node.id,
        code: data.code,
        encoding: "utf-8",
        contentHash,
        storageType: StorageType.DATABASE,
      },
    });

    logger.info(`File created: ${data.path} in project ${projectId}`);

    return node as NodeResponse;
  } catch (error) {
    logger.error("Error creating file:", error);
    throw error;
  }
}

/**
 * Create a directory in a project
 */
export async function createDirectory(
  projectId: string,
  userId: string,
  data: CreateDirectoryRequest
): Promise<NodeResponse> {
  try {
    // Verify project ownership
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project || project.userId !== userId) {
      const error = new Error("Unauthorized to access this project");
      (error as any).status = 403;
      (error as any).code = "FORBIDDEN";
      throw error;
    }

    // Check if directory already exists
    const existing = await prisma.node.findUnique({
      where: {
        projectId_path: {
          projectId,
          path: data.path,
        },
      },
    });

    if (existing) {
      const error = new Error("Directory already exists at this path");
      (error as any).status = 409;
      (error as any).code = "DIR_EXISTS";
      throw error;
    }

    // Normalize parentId (empty string should be treated as null)
    const parentId = data.parentId && data.parentId.trim() ? data.parentId : null;

    // Validate parent if provided
    if (parentId) {
      const parent = await prisma.node.findUnique({
        where: { id: parentId },
      });

      if (!parent) {
        const error = new Error("Parent node not found");
        (error as any).status = 404;
        (error as any).code = "PARENT_NOT_FOUND";
        throw error;
      }

      if (parent.projectId !== projectId) {
        const error = new Error("Parent node does not belong to this project");
        (error as any).status = 400;
        (error as any).code = "INVALID_PARENT_PROJECT";
        throw error;
      }

      if (parent.type !== NodeType.DIRECTORY) {
        const error = new Error("Parent node must be a directory");
        (error as any).status = 400;
        (error as any).code = "INVALID_PARENT_TYPE";
        throw error;
      }
    }

    console.log("Directory data:", {
      name: data.name,
      type: NodeType.DIRECTORY,
      path: data.path,
      projectId,
      parentId,
    });

    // Create directory
    const node = await prisma.node.create({
      data: {
        name: data.name,
        type: NodeType.DIRECTORY,
        path: data.path,
        projectId,
        parentId,
      },
    });

    logger.info(`Directory created: ${data.path} in project ${projectId}`);

    return node as NodeResponse;
  } catch (error) {
    logger.error("Error creating directory:", error);
    throw error;
  }
}

/**
 * Get a node (file or directory) by ID
 */
export async function getNode(
  nodeId: string,
  userId: string
): Promise<NodeResponse> {
  try {
    const node = await prisma.node.findUnique({
      where: { id: nodeId },
      include: {
        project: true,
      },
    });

    if (!node) {
      const error = new Error("Node not found");
      (error as any).status = 404;
      (error as any).code = "NODE_NOT_FOUND";
      throw error;
    }

    // Verify authorization
    if (node.project.userId !== userId) {
      const error = new Error("Unauthorized to access this node");
      (error as any).status = 403;
      (error as any).code = "FORBIDDEN";
      throw error;
    }

    return node as NodeResponse;
  } catch (error) {
    logger.error("Error fetching node:", error);
    throw error;
  }
}

/**
 * Get file content
 */
export async function getFileContent(
  nodeId: string,
  userId: string
): Promise<FileContentResponse> {
  try {
    // First verify the node exists and user has access
    const node = await getNode(nodeId, userId);

    if (node.type !== NodeType.FILE) {
      const error = new Error("Node is not a file");
      (error as any).status = 400;
      (error as any).code = "NOT_A_FILE";
      throw error;
    }

    const content = await prisma.fileContent.findUnique({
      where: { nodeId },
    });

    if (!content) {
      const error = new Error("File content not found");
      (error as any).status = 404;
      (error as any).code = "CONTENT_NOT_FOUND";
      throw error;
    }

    return content as FileContentResponse;
  } catch (error) {
    logger.error("Error fetching file content:", error);
    throw error;
  }
}

/**
 * Update file content
 */
export async function updateFileContent(
  nodeId: string,
  userId: string,
  data: UpdateFileContentRequest
): Promise<FileContentResponse> {
  try {
    // Verify access
    const node = await getNode(nodeId, userId);

    if (node.type !== NodeType.FILE) {
      const error = new Error("Node is not a file");
      (error as any).status = 400;
      (error as any).code = "NOT_A_FILE";
      throw error;
    }

    // Calculate new hash
    const contentHash = calculateHash(data.code);

    // Update file content
    const fileContent = await prisma.fileContent.update({
      where: { nodeId },
      data: {
        code: data.code,
        contentHash,
      },
    });

    // Update node size
    await prisma.node.update({
      where: { id: nodeId },
      data: {
        size: data.code.length,
      },
    });

    logger.info(`File content updated: ${nodeId}`);

    return fileContent as FileContentResponse;
  } catch (error) {
    logger.error("Error updating file content:", error);
    throw error;
  }
}

/**
 * Get project tree (all nodes in a project)
 */
export async function getProjectTree(
  projectId: string,
  userId: string
): Promise<NodeResponse[]> {
  try {
    // Verify project ownership
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project || project.userId !== userId) {
      const error = new Error("Unauthorized to access this project");
      (error as any).status = 403;
      (error as any).code = "FORBIDDEN";
      throw error;
    }

    // Get all nodes in the project
    const nodes = await prisma.node.findMany({
      where: {
        projectId,
      },
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
    });

    return buildTree(nodes as NodeResponse[]);
  } catch (error) {
    logger.error("Error fetching project tree:", error);
    throw error;
  }
}

/**
 * Get children of a directory
 */
export async function getDirectoryContents(
  nodeId: string,
  userId: string
): Promise<NodeResponse[]> {
  try {
    // Verify node exists and user has access
    const node = await getNode(nodeId, userId);

    if (node.type !== NodeType.DIRECTORY) {
      const error = new Error("Node is not a directory");
      (error as any).status = 400;
      (error as any).code = "NOT_A_DIRECTORY";
      throw error;
    }

    const children = await prisma.node.findMany({
      where: {
        parentId: nodeId,
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });

    return buildTree(children as NodeResponse[]);
  } catch (error) {
    logger.error("Error fetching directory contents:", error);
    throw error;
  }
}

/**
 * Delete a node (file or directory)
 */
export async function deleteNode(
  nodeId: string,
  userId: string
): Promise<{ message: string }> {
  try {
    // Verify access
    const node = await getNode(nodeId, userId);

    // If it's a file, explicitly delete FileContent first to handle cases where it might not exist
    // This prevents P2025 errors when cascade delete fails
    if (node.type === NodeType.FILE) {
      await prisma.fileContent.deleteMany({
        where: { nodeId },
      });
    }

    // Delete the node (cascade will handle remaining FileContent and children)
    await prisma.node.delete({
      where: { id: nodeId },
    });

    logger.info(`Node deleted: ${nodeId}`);

    return { message: "Node deleted successfully" };
  } catch (error) {
    logger.error("Error deleting node:", error);
    throw error;
  }
}

/**
 * Rename a node
 */
export async function renameNode(
  nodeId: string,
  userId: string,
  newName: string
): Promise<NodeResponse> {
  try {
    // Verify access
    const node = await getNode(nodeId, userId);

    if (!newName || newName.trim() === "") {
      const error = new Error("Node name cannot be empty");
      (error as any).status = 400;
      (error as any).code = "INVALID_NAME";
      throw error;
    }

    // Update the node
    const updatedNode = await prisma.node.update({
      where: { id: nodeId },
      data: {
        name: newName.trim(),
      },
    });

    logger.info(`Node renamed: ${nodeId} to ${newName}`);

    return updatedNode as NodeResponse;
  } catch (error) {
    logger.error("Error renaming node:", error);
    throw error;
  }
}

/**
 * Move a node to a different parent
 */
export async function moveNode(
  nodeId: string,
  userId: string,
  newParentId: string | null
): Promise<NodeResponse> {
  try {
    // Verify source node access
    const node = await getNode(nodeId, userId);

    // If moving to a new parent, verify parent exists and user has access
    if (newParentId) {
      const newParent = await getNode(newParentId, userId);

      if (newParent.type !== NodeType.DIRECTORY) {
        const error = new Error("New parent must be a directory");
        (error as any).status = 400;
        (error as any).code = "INVALID_PARENT";
        throw error;
      }

      // Prevent circular references
      if (newParentId === nodeId) {
        const error = new Error("Cannot move node to itself");
        (error as any).status = 400;
        (error as any).code = "CIRCULAR_REFERENCE";
        throw error;
      }
    }

    // Move the node
    const updatedNode = await prisma.node.update({
      where: { id: nodeId },
      data: {
        parentId: newParentId,
      },
    });

    logger.info(`Node moved: ${nodeId} to parent ${newParentId || "root"}`);

    return updatedNode as NodeResponse;
  } catch (error) {
    logger.error("Error moving node:", error);
    throw error;
  }
}

/**
 * Search for nodes in a project
 */
export async function searchNodes(
  projectId: string,
  userId: string,
  query: string
): Promise<NodeResponse[]> {
  try {
    // Verify project ownership
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project || project.userId !== userId) {
      const error = new Error("Unauthorized to access this project");
      (error as any).status = 403;
      (error as any).code = "FORBIDDEN";
      throw error;
    }

    // Search nodes by name or path
    const nodes = await prisma.node.findMany({
      where: {
        projectId,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { path: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { path: "asc" },
    });

    return buildTree(nodes as NodeResponse[]);
  } catch (error) {
    logger.error("Error searching nodes:", error);
    throw error;
  }
}

/**
 * Get node statistics for a project
 */
export async function getProjectStatistics(
  projectId: string,
  userId: string
): Promise<{
  totalFiles: number;
  totalDirectories: number;
  totalSize: number;
  filesByType: { mimeType: string; count: number }[];
}> {
  try {
    // Verify project ownership
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project || project.userId !== userId) {
      const error = new Error("Unauthorized to access this project");
      (error as any).status = 403;
      (error as any).code = "FORBIDDEN";
      throw error;
    }

    const nodes = await prisma.node.findMany({
      where: { projectId },
    });

    const files = nodes.filter((n) => n.type === NodeType.FILE);
    const directories = nodes.filter((n) => n.type === NodeType.DIRECTORY);

    const filesByType: { [key: string]: number } = {};
    let totalSize = 0;

    files.forEach((file) => {
      if (file.mimeType) {
        filesByType[file.mimeType] = (filesByType[file.mimeType] || 0) + 1;
      }
      if (file.size) {
        totalSize += file.size;
      }
    });

    return {
      totalFiles: files.length,
      totalDirectories: directories.length,
      totalSize,
      filesByType: Object.entries(filesByType).map(([mimeType, count]) => ({
        mimeType,
        count,
      })),
    };
  } catch (error) {
    logger.error("Error getting project statistics:", error);
    throw error;
  }
}
