import CodeInterpreter from "@e2b/code-interpreter";

export interface ExecutionResult {
  executionId: string;
  status: "running" | "completed" | "error";
  output?: string;
  error?: string;
  logs?: string[];
  duration?: number;
}

export interface ExecutionRequest {
  code: string;
  language: string;
  timeout?: number;
}

class E2BService {
  private activeSandboxes: Map<string, CodeInterpreter>;
  private executionResults: Map<string, ExecutionResult>;

  constructor() {
    this.activeSandboxes = new Map();
    this.executionResults = new Map();
  }

  /**
   * Execute code in E2B sandbox
   */
  async executeCode(
    executionId: string,
    request: ExecutionRequest
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // Validate E2B API key
      if (!process.env.E2B_API_KEY) {
        throw new Error("E2B_API_KEY is not configured");
      }

      // Create sandbox
      const sandbox = await CodeInterpreter.create({
        apiKey: process.env.E2B_API_KEY,
        timeoutMs: request.timeout || parseInt(process.env.E2B_TIMEOUT || "30000"),
      });

      this.activeSandboxes.set(executionId, sandbox);

      // Update status to running
      this.executionResults.set(executionId, {
        executionId,
        status: "running",
        logs: [],
      });

      // Execute the code
      const execution = await sandbox.runCode(request.code);

      const duration = Date.now() - startTime;

      // Process results
      const logs: string[] = [];
      let output = "";
      let error = "";

      if (execution.error) {
        error = `${execution.error.name}: ${execution.error.value}\n${execution.error.traceback}`;
      }

      // Collect outputs
      for (const result of execution.results) {
        if (result.text) {
          output += result.text + "\n";
        }
        if (result.png) {
          output += `[PNG Image: ${result.png.substring(0, 50)}...]\n`;
        }
        if (result.jpeg) {
          output += `[JPEG Image: ${result.jpeg.substring(0, 50)}...]\n`;
        }
        if (result.svg) {
          output += `[SVG Image]\n`;
        }
        if (result.html) {
          output += `[HTML Content]\n`;
        }
        if (result.json) {
          output += JSON.stringify(result.json, null, 2) + "\n";
        }
      }

      // Collect logs
      for (const log of execution.logs.stdout) {
        logs.push(`[stdout] ${log}`);
      }
      for (const log of execution.logs.stderr) {
        logs.push(`[stderr] ${log}`);
      }

      const result: ExecutionResult = {
        executionId,
        status: execution.error ? "error" : "completed",
        output: output.trim(),
        error: error.trim() || undefined,
        logs,
        duration,
      };

      this.executionResults.set(executionId, result);

      // Clean up sandbox
      await sandbox.kill();
      this.activeSandboxes.delete(executionId);

      return result;
    } catch (err) {
      const duration = Date.now() - startTime;
      const error = err instanceof Error ? err.message : "Unknown error occurred";

      const result: ExecutionResult = {
        executionId,
        status: "error",
        error,
        duration,
      };

      this.executionResults.set(executionId, result);

      // Clean up sandbox if it exists
      const sandbox = this.activeSandboxes.get(executionId);
      if (sandbox) {
        try {
          await sandbox.kill();
        } catch (closeErr) {
          console.error("Error closing sandbox:", closeErr);
        }
        this.activeSandboxes.delete(executionId);
      }

      return result;
    }
  }

  /**
   * Get execution result by ID
   */
  getExecutionResult(executionId: string): ExecutionResult | undefined {
    return this.executionResults.get(executionId);
  }

  /**
   * Stop a running execution
   */
  async stopExecution(executionId: string): Promise<boolean> {
    const sandbox = this.activeSandboxes.get(executionId);

    if (!sandbox) {
      return false;
    }

    try {
      await sandbox.kill();
      this.activeSandboxes.delete(executionId);

      // Update status
      const result = this.executionResults.get(executionId);
      if (result) {
        result.status = "error";
        result.error = "Execution stopped by user";
      }

      return true;
    } catch (err) {
      console.error("Error stopping execution:", err);
      return false;
    }
  }

  /**
   * Clean up old execution results (older than 1 hour)
   */
  cleanupOldResults(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    for (const [executionId, result] of this.executionResults.entries()) {
      if (result.duration && Date.now() - result.duration > oneHourAgo) {
        this.executionResults.delete(executionId);
      }
    }
  }
}

// Singleton instance
export const e2bService = new E2BService();

// Clean up old results every 30 minutes
setInterval(() => {
  e2bService.cleanupOldResults();
}, 30 * 60 * 1000);
