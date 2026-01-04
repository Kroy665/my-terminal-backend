import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import { errorHandler } from "./middleware/errorHandler.js";
import logger from "./utils/logger.js";
import authRouter from "./routes/auth.js";
import projectsRouter from "./routes/projects.js";
import contentRouter from "./routes/content.js";
import executionRouter from "./routes/execution.js";
import sandboxRouter from "./routes/sandbox.js";
import { startSandboxCleanupScheduler } from "./services/sandboxCleanupScheduler.js";

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 6060;
const NODE_ENV = process.env.NODE_ENV || "development";

// Middleware
app.use(cors());
app.use(morgan(NODE_ENV === "development" ? "dev" : "combined"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
  });
});

// API routes
app.use("/api/auth", authRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/content", contentRouter);
app.use("/api/execution", executionRouter);
app.use("/api/sandboxes", sandboxRouter);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: "Route not found",
    path: req.path,
    method: req.method,
  });
});

// Error handling middleware
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Server is running on http://localhost:${PORT} in ${NODE_ENV} mode`);
});

// Start sandbox cleanup scheduler
const cleanupScheduler = startSandboxCleanupScheduler();

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM signal received: closing HTTP server");
  clearInterval(cleanupScheduler);
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT signal received: closing HTTP server");
  clearInterval(cleanupScheduler);
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
});

export default app;
