import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { e2bService, ExecutionRequest } from "../services/e2b.service";
import { getProjectById } from "../services/projectService";
import { getProjectTree } from "../services/contentService";

const router = Router();

/**
 * POST /api/execution/run
 * Execute code in a sandbox
 */
router.post("/run", async (req: Request, res: Response) => {
  try {
    const { code, language, timeout } = req.body as ExecutionRequest;

    // Validate request
    if (!code || typeof code !== "string") {
      return res.status(400).json({
        error: "Code is required and must be a string",
      });
    }

    if (!language || typeof language !== "string") {
      return res.status(400).json({
        error: "Language is required and must be a string",
      });
    }

    // Currently E2B Code Interpreter supports Python
    if (language.toLowerCase() !== "python") {
      return res.status(400).json({
        error: "Currently only Python is supported",
      });
    }

    // Generate execution ID
    const executionId = uuidv4();

    // Start execution asynchronously
    e2bService
      .executeCode(executionId, { code, language, timeout })
      .catch((err) => {
        console.error(`Execution ${executionId} failed:`, err);
      });

    // Return execution ID immediately
    res.status(202).json({
      message: "Code execution started",
      executionId,
    });
  } catch (error) {
    console.error("Error starting execution:", error);
    res.status(500).json({
      error: "Failed to start code execution",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/execution/:executionId
 * Get execution status and results
 */
router.get("/:executionId", (req: Request, res: Response) => {
  try {
    const { executionId } = req.params;

    const result = e2bService.getExecutionResult(executionId);

    if (!result) {
      return res.status(404).json({
        error: "Execution not found",
        executionId,
      });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error("Error getting execution result:", error);
    res.status(500).json({
      error: "Failed to get execution result",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /api/execution/:executionId/stop
 * Stop a running execution
 */
router.post("/:executionId/stop", async (req: Request, res: Response) => {
  try {
    const { executionId } = req.params;

    const stopped = await e2bService.stopExecution(executionId);

    if (!stopped) {
      return res.status(404).json({
        error: "Execution not found or already completed",
        executionId,
      });
    }

    res.status(200).json({
      message: "Execution stopped successfully",
      executionId,
    });
  } catch (error) {
    console.error("Error stopping execution:", error);
    res.status(500).json({
      error: "Failed to stop execution",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});


/**
 * POST add files to the sandbox
 */
router.post("/add-files/:id/:userId", async (req: Request, res: Response) => {
  try {
    const { id, userId } = req.params;

    const project = await getProjectTree(id, userId);

    if (!project) {
      return res.status(404).json({
        error: "Project not found",
        id,
        userId,
      });
    }

    





    res.status(200).json(project);
  } catch (error) {
    console.error("Error getting execution result:", error);
    res.status(500).json({
      error: "Failed to get execution result",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});


export default router;
