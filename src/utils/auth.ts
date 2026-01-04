import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import logger from "./logger";

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-key";
const JWT_EXPIRY = process.env.JWT_EXPIRY || "7d"; // Can be "7d", "24h", or seconds as number
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "default-refresh-secret";
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || "30d"; // Can be "30d", "7d", or seconds as number
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "10");

export interface TokenPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface DecodedToken extends TokenPayload {
  iat: number;
  exp: number;
}

/**
 * Hash a password using bcrypt
 */
export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const callback = (err: Error | null, hash: string) => {
      if (err) {
        logger.error("Error hashing password:"+err);
        reject(new Error("Failed to hash password"));
      } else {
        resolve(hash);
      }
    };
    bcrypt.hash(password, BCRYPT_ROUNDS, callback);
  });
}

/**
 * Compare a password with its hash
 */
export function comparePasswords(
  password: string,
  hash: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const callback = (err: Error | null, result: boolean) => {
      if (err) {
        logger.error("Error comparing passwords:"+err);
        resolve(false);
      } else {
        resolve(result);
      }
    };
    bcrypt.compare(password, hash, callback);
  });
}

/**
 * Generate a JWT access token
 */
export function generateAccessToken(payload: TokenPayload): string {
  try {
    const options = {
      expiresIn: JWT_EXPIRY,
    };
    const token = jwt.sign(payload, JWT_SECRET, options as any);
    return token;
  } catch (error) {
    logger.error("Error generating access token:"+error);
    throw new Error("Failed to generate access token");
  }
}

/**
 * Generate a JWT refresh token
 */
export function generateRefreshToken(payload: TokenPayload): string {
  try {
    const options = {
      expiresIn: JWT_REFRESH_EXPIRY,
    };
    const token = jwt.sign(payload, JWT_REFRESH_SECRET, options as any);
    return token;
  } catch (error) {
    logger.error("Error generating refresh token:"+error);
    throw new Error("Failed to generate refresh token");
  }
}

/**
 * Verify an access token
 */
export function verifyAccessToken(token: string): DecodedToken | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.warn("Access token has expired");
    } else if (error instanceof jwt.JsonWebTokenError) {
      logger.warn("Invalid access token");
    }
    return null;
  }
}

/**
 * Verify a refresh token
 */
export function verifyRefreshToken(token: string): DecodedToken | null {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as DecodedToken;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.warn("Refresh token has expired");
    } else if (error instanceof jwt.JsonWebTokenError) {
      logger.warn("Invalid refresh token");
    }
    return null;
  }
}

/**
 * Generate tokens for a user
 */
export function generateTokens(userId: string, email: string) {
  const payload: TokenPayload = { userId, email };
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 * Requirements: at least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special char
 */
export function validatePassword(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(
  authHeader: string | undefined
): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return null;
  }

  return parts[1];
}
