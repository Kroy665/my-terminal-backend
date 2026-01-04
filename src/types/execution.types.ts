/**
 * Request body for code execution
 */
export interface ExecuteCodeRequest {
  code: string;
  language: string;
  timeout?: number;
}

/**
 * Response for code execution start
 */
export interface ExecuteCodeResponse {
  message: string;
  executionId: string;
}

/**
 * Execution status types
 */
export type ExecutionStatus = "running" | "completed" | "error";

/**
 * Execution result response
 */
export interface ExecutionResultResponse {
  executionId: string;
  status: ExecutionStatus;
  output?: string;
  error?: string;
  logs?: string[];
  duration?: number;
}

/**
 * Stop execution response
 */
export interface StopExecutionResponse {
  message: string;
  executionId: string;
}

/**
 * Error response
 */
export interface ErrorResponse {
  error: string;
  details?: string;
  executionId?: string;
}
