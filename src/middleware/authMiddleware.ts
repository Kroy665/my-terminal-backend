import { Request, Response, NextFunction } from "express";
import { extractTokenFromHeader, verifyAccessToken } from "../utils/auth";
import logger from "../utils/logger";

export interface AuthRequest extends Request {
  userId?: string;
  email?: string;
  user?: {
    userId: string;
    email: string;
  };
}

/**
 * Middleware to verify JWT token and attach user info to request
 */
export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      logger.warn("No token provided in request");
      res.status(401).json({
        error: {
          status: 401,
          code: "UNAUTHORIZED",
          message: "No authentication token provided",
        },
      });
      return;
    }

    const decoded = verifyAccessToken(token);
    if (!decoded) {
      logger.warn("Invalid or expired token");
      res.status(401).json({
        error: {
          status: 401,
          code: "INVALID_TOKEN",
          message: "Invalid or expired token",
        },
      });
      return;
    }

    // Attach user info to request
    req.userId = decoded.userId;
    req.email = decoded.email;
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
    };

    next();
  } catch (error) {
    logger.error("Error in authenticateToken middleware:"+error);
    res.status(500).json({
      error: {
        status: 500,
        code: "INTERNAL_ERROR",
        message: "Internal server error",
      },
    });
  }
};

/**
 * Optional authentication middleware - doesn't fail if token is missing, but validates if present
 */
export const optionalAuthenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      next();
      return;
    }

    const decoded = verifyAccessToken(token);
    if (decoded) {
      req.userId = decoded.userId;
      req.email = decoded.email;
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
      };
    }

    next();
  } catch (error) {
    logger.error("Error in optionalAuthenticate middleware:", error);
    next();
  }
};

/**
 * Middleware to check if user is authenticated (wrapper for better readability)
 */
export const requireAuth = authenticateToken;
