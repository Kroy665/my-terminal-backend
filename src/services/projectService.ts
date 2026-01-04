import { PrismaClient } from "@prisma/client";
import logger from "../utils/logger";

const prisma = new PrismaClient();

export interface CreateProjectRequest {
  name: string;
  description?: string;
  language: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  language?: string;
  isPublic?: boolean;
}

export interface ProjectResponse {
  id: string;
  name: string;
  description?: string;
  language: string;
  userId: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get all projects for a user
 */
export async function getUserProjects(
  userId: string
): Promise<ProjectResponse[]> {
  try {
    const projects = await prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    return projects as ProjectResponse[];
  } catch (error) {
    logger.error("Error fetching user projects:", error);
    throw error;
  }
}

/**
 * Get a single project by ID
 */
export async function getProjectById(
  projectId: string,
  userId?: string
): Promise<ProjectResponse> {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      const error = new Error("Project not found");
      (error as any).status = 404;
      (error as any).code = "PROJECT_NOT_FOUND";
      throw error;
    }

    // Check authorization if userId provided
    const projectData = project as any;
    if (userId && project.userId !== userId && !projectData.isPublic) {
      const error = new Error("Unauthorized to access this project");
      (error as any).status = 403;
      (error as any).code = "FORBIDDEN";
      throw error;
    }

    return projectData as ProjectResponse;
  } catch (error) {
    logger.error("Error fetching project:", error);
    throw error;
  }
}

/**
 * Create a new project
 */
export async function createProject(
  userId: string,
  data: CreateProjectRequest
): Promise<ProjectResponse> {
  try {
    // Validate input
    if (!data.name || !data.name.trim()) {
      const error = new Error("Project name is required");
      (error as any).status = 400;
      (error as any).code = "INVALID_NAME";
      throw error;
    }

    if (!data.language || !data.language.trim()) {
      const error = new Error("Language is required");
      (error as any).status = 400;
      (error as any).code = "INVALID_LANGUAGE";
      throw error;
    }

    // Check for duplicate name in user's projects
    const existingProject = await prisma.project.findFirst({
      where: {
        userId,
        name: data.name,
      },
    });

    if (existingProject) {
      const error = new Error("Project with this name already exists");
      (error as any).status = 409;
      (error as any).code = "PROJECT_EXISTS";
      throw error;
    }

    const project = await prisma.project.create({
      data: {
        name: data.name.trim(),
        description: data.description?.trim(),
        language: data.language.trim(),
        userId,
      },
    });

    logger.info(`Project created: ${project.id} for user: ${userId}`);

    return project as ProjectResponse;
  } catch (error) {
    logger.error("Error creating project:", error);
    throw error;
  }
}

/**
 * Update a project
 */
export async function updateProject(
  projectId: string,
  userId: string,
  data: UpdateProjectRequest
): Promise<ProjectResponse> {
  try {
    // Get existing project
    const project = await getProjectById(projectId, userId);

    // Validate updates
    if (data.name !== undefined && !data.name.trim()) {
      const error = new Error("Project name cannot be empty");
      (error as any).status = 400;
      (error as any).code = "INVALID_NAME";
      throw error;
    }

    if (data.language !== undefined && !data.language.trim()) {
      const error = new Error("Language cannot be empty");
      (error as any).status = 400;
      (error as any).code = "INVALID_LANGUAGE";
      throw error;
    }

    // Check for duplicate name (excluding current project)
    if (data.name) {
      const duplicateProject = await prisma.project.findFirst({
        where: {
          userId,
          name: data.name,
          id: { not: projectId },
        },
      });

      if (duplicateProject) {
        const error = new Error("Project with this name already exists");
        (error as any).status = 409;
        (error as any).code = "PROJECT_EXISTS";
        throw error;
      }
    }

    const updateData: any = {};
    if (data.name) updateData.name = data.name.trim();
    if (data.description !== undefined)
      updateData.description = data.description?.trim() || null;
    if (data.language) updateData.language = data.language.trim();
    if (data.isPublic !== undefined) updateData.isPublic = data.isPublic;

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: updateData as any,
    });

    logger.info(`Project updated: ${projectId} by user: ${userId}`);

    return updatedProject as ProjectResponse;
  } catch (error) {
    logger.error("Error updating project:", error);
    throw error;
  }
}

/**
 * Delete a project
 */
export async function deleteProject(
  projectId: string,
  userId: string
): Promise<{ message: string }> {
  try {
    // Verify ownership
    const project = await getProjectById(projectId, userId);

    if (project.userId !== userId) {
      const error = new Error("Unauthorized to delete this project");
      (error as any).status = 403;
      (error as any).code = "FORBIDDEN";
      throw error;
    }

    await prisma.project.delete({
      where: { id: projectId },
    });

    logger.info(`Project deleted: ${projectId} by user: ${userId}`);

    return { message: "Project deleted successfully" };
  } catch (error) {
    logger.error("Error deleting project:", error);
    throw error;
  }
}

/**
 * Search projects by name or language
 */
export async function searchProjects(
  userId: string,
  query: string
): Promise<ProjectResponse[]> {
  try {
    const projects = await prisma.project.findMany({
      where: {
        userId,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          { language: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
    });

    return projects as ProjectResponse[];
  } catch (error) {
    logger.error("Error searching projects:", error);
    throw error;
  }
}

/**
 * Get project statistics
 */
export async function getProjectStats(userId: string): Promise<{
  totalProjects: number;
  projectsByLanguage: { language: string; count: number }[];
  totalCodeSize: number;
}> {
  try {
    const projects = await prisma.project.findMany({
      where: { userId },
    });

    const projectsByLanguage: { [key: string]: number } = {};
    let totalCodeSize = 0;

    projects.forEach((project: any) => {
      projectsByLanguage[project.language] =
        (projectsByLanguage[project.language] || 0) + 1;
      totalCodeSize += project.code ? project.code.length : 0;
    });

    return {
      totalProjects: projects.length,
      projectsByLanguage: Object.entries(projectsByLanguage).map(
        ([language, count]) => ({ language, count })
      ),
      totalCodeSize,
    };
  } catch (error) {
    logger.error("Error getting project stats:", error);
    throw error;
  }
}

/**
 * Duplicate a project
 */
export async function duplicateProject(
  projectId: string,
  userId: string
): Promise<ProjectResponse> {
  try {
    const originalProject = await getProjectById(projectId, userId);

    // Find a unique name for the duplicate
    let newName = `${originalProject.name} (Copy)`;
    let counter = 1;

    while (true) {
      const existing = await prisma.project.findFirst({
        where: { userId, name: newName },
      });

      if (!existing) break;

      newName = `${originalProject.name} (Copy ${counter})`;
      counter++;
    }

    const duplicatedProject = await prisma.project.create({
      data: {
        name: newName,
        description: originalProject.description,
        language: originalProject.language,
        userId,
      },
    });

    logger.info(
      `Project duplicated: ${projectId} -> ${duplicatedProject.id} by user: ${userId}`
    );

    return duplicatedProject as ProjectResponse;
  } catch (error) {
    logger.error("Error duplicating project:", error);
    throw error;
  }
}

