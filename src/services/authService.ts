import { PrismaClient } from "@prisma/client";
import {
  hashPassword,
  comparePasswords,
  generateTokens,
  validateEmail,
  validatePassword,
} from "../utils/auth";
import logger from "../utils/logger";

const prisma = new PrismaClient();

export interface RegisterRequest {
  email: string;
  name: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Register a new user
 */
export async function register(data: RegisterRequest): Promise<AuthResponse> {
  try {
    // Validate email
    if (!validateEmail(data.email)) {
      const error = new Error("Invalid email format");
      (error as any).status = 400;
      (error as any).code = "INVALID_EMAIL";
      throw error;
    }

    // Validate password
    const passwordValidation = validatePassword(data.password);
    if (!passwordValidation.isValid) {
      const error = new Error(passwordValidation.errors.join(", "));
      (error as any).status = 400;
      (error as any).code = "WEAK_PASSWORD";
      throw error;
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      const error = new Error("User with this email already exists");
      (error as any).status = 409;
      (error as any).code = "USER_EXISTS";
      throw error;
    }

    // Hash password
    const hashedPassword = await hashPassword(data.password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Generate tokens
    const tokens = generateTokens(user.id, user.email);

    logger.info(`User registered successfully: ${user.email}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  } catch (error) {
    logger.error("Error registering user:", error);
    throw error;
  }
}

/**
 * Login user
 */
export async function login(data: LoginRequest): Promise<AuthResponse> {
  try {
    // Validate email
    if (!validateEmail(data.email)) {
      const error = new Error("Invalid email format");
      (error as any).status = 400;
      (error as any).code = "INVALID_EMAIL";
      throw error;
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      const error = new Error("Invalid email or password");
      (error as any).status = 401;
      (error as any).code = "INVALID_CREDENTIALS";
      throw error;
    }

    // Compare passwords
    const isPasswordValid = await comparePasswords(data.password, user.password);
    if (!isPasswordValid) {
      const error = new Error("Invalid email or password");
      (error as any).status = 401;
      (error as any).code = "INVALID_CREDENTIALS";
      throw error;
    }

    // Generate tokens
    const tokens = generateTokens(user.id, user.email);

    logger.info(`User logged in successfully: ${user.email}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  } catch (error) {
    logger.error("Error logging in user:", error);
    throw error;
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<UserProfile> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      const error = new Error("User not found");
      (error as any).status = 404;
      (error as any).code = "USER_NOT_FOUND";
      throw error;
    }

    return user;
  } catch (error) {
    logger.error("Error fetching user:", error);
    throw error;
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  userId: string,
  email: string
): Promise<{ accessToken: string; refreshToken: string }> {
  try {
    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      const error = new Error("User not found");
      (error as any).status = 404;
      (error as any).code = "USER_NOT_FOUND";
      throw error;
    }

    // Generate new tokens
    const tokens = generateTokens(user.id, user.email);

    logger.info(`Tokens refreshed for user: ${user.email}`);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  } catch (error) {
    logger.error("Error refreshing token:", error);
    throw error;
  }
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  userId: string,
  updates: { name?: string; email?: string }
): Promise<UserProfile> {
  try {
    // If email is being updated, check if it's already in use
    if (updates.email) {
      if (!validateEmail(updates.email)) {
        const error = new Error("Invalid email format");
        (error as any).status = 400;
        (error as any).code = "INVALID_EMAIL";
        throw error;
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: updates.email },
      });

      if (existingUser && existingUser.id !== userId) {
        const error = new Error("Email already in use");
        (error as any).status = 409;
        (error as any).code = "EMAIL_IN_USE";
        throw error;
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updates,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logger.info(`User profile updated: ${user.email}`);

    return user;
  } catch (error) {
    logger.error("Error updating user profile:", error);
    throw error;
  }
}

/**
 * Change user password
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ message: string }> {
  try {
    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      const error = new Error("User not found");
      (error as any).status = 404;
      (error as any).code = "USER_NOT_FOUND";
      throw error;
    }

    // Verify current password
    const isPasswordValid = await comparePasswords(
      currentPassword,
      user.password
    );
    if (!isPasswordValid) {
      const error = new Error("Current password is incorrect");
      (error as any).status = 401;
      (error as any).code = "INVALID_PASSWORD";
      throw error;
    }

    // Validate new password
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      const error = new Error(passwordValidation.errors.join(", "));
      (error as any).status = 400;
      (error as any).code = "WEAK_PASSWORD";
      throw error;
    }

    // Check if new password is same as current
    const isSamePassword = await comparePasswords(newPassword, user.password);
    if (isSamePassword) {
      const error = new Error(
        "New password cannot be the same as current password"
      );
      (error as any).status = 400;
      (error as any).code = "SAME_PASSWORD";
      throw error;
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    logger.info(`Password changed for user: ${user.email}`);

    return { message: "Password changed successfully" };
  } catch (error) {
    logger.error("Error changing password:", error);
    throw error;
  }
}
