import { Router, Response } from "express";
import logger from "../utils/logger";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, AuthRequest } from "../middleware/authMiddleware";
import {
  register,
  login,
  getUserById,
  refreshAccessToken,
  updateUserProfile,
  changePassword,
} from "../services/authService";
import { verifyRefreshToken } from "../utils/auth";

const router = Router();

/**
 * POST /api/auth/register
 * Register a new user
 * Body: { email: string, name: string, password: string }
 */
router.post(
  "/register",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { email, name, password } = req.body;

    // Validate required fields
    if (!email || !name || !password) {
      res.status(400).json({
        error: {
          status: 400,
          code: "MISSING_FIELDS",
          message: "Email, name, and password are required",
        },
      });
      return;
    }

    try {
      const result = await register({ email, name, password });

      logger.info(`User registered successfully: ${email}`);
      res.status(201).json(result);
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
 * POST /api/auth/login
 * User login
 * Body: { email: string, password: string }
 */
router.post(
  "/login",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      res.status(400).json({
        error: {
          status: 400,
          code: "MISSING_FIELDS",
          message: "Email and password are required",
        },
      });
      return;
    }

    try {
      const result = await login({ email, password });

      logger.info(`User logged in successfully: ${email}`);
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
 * POST /api/auth/refresh
 * Refresh JWT token
 * Body: { refreshToken: string }
 */
router.post(
  "/refresh",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        error: {
          status: 400,
          code: "MISSING_TOKEN",
          message: "Refresh token is required",
        },
      });
      return;
    }

    try {
      const decoded = verifyRefreshToken(refreshToken);

      if (!decoded) {
        res.status(401).json({
          error: {
            status: 401,
            code: "INVALID_REFRESH_TOKEN",
            message: "Invalid or expired refresh token",
          },
        });
        return;
      }

      const tokens = await refreshAccessToken(decoded.userId, decoded.email);

      logger.info(`Token refreshed for user: ${decoded.email}`);
      res.status(200).json(tokens);
    } catch (error: any) {
      res.status(500).json({
        error: {
          status: 500,
          code: "INTERNAL_ERROR",
          message: "Failed to refresh token",
        },
      });
    }
  })
);

/**
 * POST /api/auth/logout
 * User logout
 * Note: In a JWT-based system, logout is typically handled on the client side
 * by removing the token. This endpoint can be used for logging purposes.
 */
router.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    logger.info(`User logged out: ${req.email}`);
    res.status(200).json({
      message: "Logged out successfully",
    });
  })
);

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get(
  "/me",
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

      const user = await getUserById(req.userId);

      res.status(200).json(user);
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
 * PUT /api/auth/profile
 * Update user profile
 * Body: { name?: string, email?: string }
 */
router.put(
  "/profile",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, email } = req.body;

    if (!name && !email) {
      res.status(400).json({
        error: {
          status: 400,
          code: "MISSING_FIELDS",
          message: "At least one field (name or email) is required",
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

      const updates: { name?: string; email?: string } = {};
      if (name) updates.name = name;
      if (email) updates.email = email;

      const user = await updateUserProfile(req.userId, updates);

      logger.info(`User profile updated: ${req.email}`);
      res.status(200).json(user);
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
 * POST /api/auth/change-password
 * Change user password
 * Body: { currentPassword: string, newPassword: string }
 */
router.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        error: {
          status: 400,
          code: "MISSING_FIELDS",
          message: "Current password and new password are required",
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

      const result = await changePassword(
        req.userId,
        currentPassword,
        newPassword
      );

      logger.info(`Password changed for user: ${req.email}`);
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

export default router;
