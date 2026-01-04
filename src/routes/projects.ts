import { Router, Response } from "express";
import logger from "../utils/logger";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, AuthRequest } from "../middleware/authMiddleware";
import {
  getUserProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  searchProjects,
  getProjectStats,
  duplicateProject,
} from "../services/projectService";

const router = Router();

/**
 * GET /api/projects
 * Get all projects for the user
 * Query: ?search=<query>
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

      const search = req.query.search as string | undefined;

      let projects;
      if (search) {
        projects = await searchProjects(req.userId, search);
      } else {
        projects = await getUserProjects(req.userId);
      }

      logger.info(
        `Projects retrieved for user: ${req.email} (${projects.length} projects)`
      );

      res.status(200).json({ projects });
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
 * GET /api/projects/stats
 * Get project statistics for the user
 */
router.get(
  "/stats/overview",
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

      const stats = await getProjectStats(req.userId);

      logger.info(`Project stats retrieved for user: ${req.email}`);

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

/**
 * POST /api/projects
 * Create a new project
 * Body: { name, language, description? }
 */
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, language, description } = req.body;

    if (!name || !language) {
      res.status(400).json({
        error: {
          status: 400,
          code: "MISSING_FIELDS",
          message: "Name and language are required",
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

      const project = await createProject(req.userId, {
        name,
        language,
        description,
      });

      logger.info(`Project created: ${project.id} by user: ${req.email}`);

      res.status(201).json(project);
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
 * GET /api/projects/:id
 * Get a specific project
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

      const project = await getProjectById(id, req.userId);

      logger.info(`Project retrieved: ${id} by user: ${req.email}`);

      res.status(200).json(project);
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
 * PUT /api/projects/:id
 * Update a project
 * Body: { name?, description?, language?, isPublic? }
 */
router.put(
  "/:id",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { name, description, language, isPublic } = req.body;

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

      const project = await updateProject(id, req.userId, {
        name,
        description,
        language,
        isPublic,
      });

      logger.info(`Project updated: ${id} by user: ${req.email}`);

      res.status(200).json(project);
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
 * DELETE /api/projects/:id
 * Delete a project
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

      const result = await deleteProject(id, req.userId);

      logger.info(`Project deleted: ${id} by user: ${req.email}`);

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
 * POST /api/projects/:id/duplicate
 * Duplicate a project
 */
router.post(
  "/:id/duplicate",
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

      const project = await duplicateProject(id, req.userId);

      logger.info(`Project duplicated: ${id} by user: ${req.email}`);

      res.status(201).json(project);
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
