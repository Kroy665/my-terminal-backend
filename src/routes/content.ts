import { Router, Response } from "express";
import logger from "../utils/logger";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, AuthRequest } from "../middleware/authMiddleware";
import {
  createFile,
  createDirectory,
  getNode,
  getFileContent,
  updateFileContent,
  getProjectTree,
  getDirectoryContents,
  deleteNode,
  renameNode,
  moveNode,
  searchNodes,
  getProjectStatistics,
} from "../services/contentService";

const router = Router();

/**
 * POST /content/:projectId/files
 * Create a new file in a project
 * Body: { name, path, mimeType?, code }
 */
router.post(
  "/:projectId/files",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    const { name, path, mimeType, code, parentId } = req.body;

    console.log("/content/:projectId/files::",{projectId, name, path, mimeType, code, parentId});

    if (!name || !path || code === undefined) {
      res.status(400).json({
        error: {
          status: 400,
          code: "MISSING_FIELDS",
          message: "Name, path, and code are required",
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

      const file = await createFile(projectId, req.userId, {
        name,
        path,
        mimeType,
        code,
        parentId,
      });

      logger.info(`File created: ${path} in project ${projectId}`);

      res.status(201).json(file);
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
 * POST /content/:projectId/directories
 * Create a new directory in a project
 * Body: { name, path, parentId? }
 */
router.post(
  "/:projectId/directories",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    const { name, path, parentId } = req.body;

    if (!name || !path) {
      res.status(400).json({
        error: {
          status: 400,
          code: "MISSING_FIELDS",
          message: "Name and path are required",
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

      const directory = await createDirectory(projectId, req.userId, {
        name,
        path,
        parentId,
      });

      logger.info(`Directory created: ${path} in project ${projectId}`);

      res.status(201).json(directory);
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
 * GET /content/:nodeId
 * Get a node (file or directory)
 */
router.get(
  "/:nodeId",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { nodeId } = req.params;

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

      const node = await getNode(nodeId, req.userId);

      logger.info(`Node retrieved: ${nodeId}`);

      res.status(200).json(node);
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
 * GET /content/:nodeId/content
 * Get file content
 */
router.get(
  "/:nodeId/content",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { nodeId } = req.params;

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

      const content = await getFileContent(nodeId, req.userId);

      logger.info(`File content retrieved: ${nodeId}`);

      res.status(200).json(content);
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
 * PUT /api/nodes/:nodeId/content
 * Update file content
 * Body: { code }
 */
router.put(
  "/:nodeId/content",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { nodeId } = req.params;
    const { code } = req.body;

    if (code === undefined) {
      res.status(400).json({
        error: {
          status: 400,
          code: "MISSING_FIELDS",
          message: "Code is required",
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

      const content = await updateFileContent(nodeId, req.userId, { code });

      logger.info(`File content updated: ${nodeId}`);

      res.status(200).json(content);
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
 * GET /api/projects/:projectId/tree
 * Get project file tree
 */
router.get(
  "/:projectId/tree",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;

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

      const tree = await getProjectTree(projectId, req.userId);

      logger.info(`Project tree retrieved: ${projectId}`);

      res.status(200).json({ nodes: tree });
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
 * GET /api/nodes/:nodeId/children
 * Get directory contents (children)
 */
router.get(
  "/:nodeId/children",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { nodeId } = req.params;

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

      const children = await getDirectoryContents(nodeId, req.userId);

      logger.info(`Directory contents retrieved: ${nodeId}`);

      res.status(200).json({ children });
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
 * DELETE /api/nodes/:nodeId
 * Delete a node (file or directory)
 */
router.delete(
  "/:nodeId",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { nodeId } = req.params;

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

      const result = await deleteNode(nodeId, req.userId);

      logger.info(`Node deleted: ${nodeId}`);

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
 * PATCH /api/nodes/:nodeId/rename
 * Rename a node
 * Body: { name }
 */
router.patch(
  "/:nodeId/rename",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { nodeId } = req.params;
    const { name } = req.body;

    if (!name) {
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

      const node = await renameNode(nodeId, req.userId, name);

      logger.info(`Node renamed: ${nodeId}`);

      res.status(200).json(node);
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
 * PATCH /api/nodes/:nodeId/move
 * Move a node to a different parent
 * Body: { parentId? }
 */
router.patch(
  "/:nodeId/move",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { nodeId } = req.params;
    const { parentId } = req.body;

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

      const node = await moveNode(nodeId, req.userId, parentId || null);

      logger.info(`Node moved: ${nodeId}`);

      res.status(200).json(node);
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
 * GET /api/projects/:projectId/search
 * Search nodes in a project
 * Query: ?q=<query>
 */
router.get(
  "/:projectId/search",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    const { q } = req.query;

    if (!q || typeof q !== "string") {
      res.status(400).json({
        error: {
          status: 400,
          code: "MISSING_QUERY",
          message: "Query parameter 'q' is required",
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

      const results = await searchNodes(projectId, req.userId, q);

      logger.info(`Nodes searched in project ${projectId}: ${q}`);

      res.status(200).json({ results });
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
 * GET /api/projects/:projectId/stats
 * Get project statistics
 */
router.get(
  "/:projectId/stats",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;

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

      const stats = await getProjectStatistics(projectId, req.userId);

      logger.info(`Project statistics retrieved: ${projectId}`);

      res.status(200).json(stats);
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
