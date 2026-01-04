# E2B Sandbox Feature Documentation

## Overview

This document describes the comprehensive E2B Sandbox feature implementation in the My Terminal Backend API. This feature allows users to create, manage, and interact with isolated development sandboxes powered by E2B.

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [API Endpoints](#api-endpoints)
5. [Environment Configuration](#environment-configuration)
6. [Usage Examples](#usage-examples)
7. [Automatic Cleanup](#automatic-cleanup)
8. [Security & Limits](#security--limits)
9. [Migration Guide](#migration-guide)

---

## Features

### Core Features

- **Sandbox Lifecycle Management**
  - Create new sandboxes with customizable settings
  - List all user sandboxes
  - Get sandbox details
  - Delete/terminate sandboxes
  - Pause and resume sandboxes

- **Time-to-Live (TTL) Management**
  - Configurable TTL per sandbox
  - Extend sandbox timeout
  - Automatic cleanup of expired sandboxes

- **File Operations**
  - Write files to sandbox
  - Read files from sandbox
  - List directory contents
  - Delete files from sandbox

- **Command Execution**
  - Execute shell commands in sandbox
  - Get command output (stdout/stderr)
  - Custom working directory support

- **Settings Persistence**
  - Save sandbox configurations
  - Relaunch sandboxes with saved settings
  - Template support
  - Environment variables
  - Custom metadata

- **User Limits**
  - Maximum concurrent sandboxes per user
  - Maximum TTL constraints
  - Resource limits (disk, memory)

---

## Architecture

### Components

```
src/
├── services/
│   ├── sandboxService.ts              # Core sandbox business logic
│   └── sandboxCleanupScheduler.ts     # Automatic cleanup scheduler
├── routes/
│   └── sandbox.ts                     # Express routes for sandbox API
└── index.ts                           # App initialization with scheduler
```

### Data Flow

```
Client Request
    ↓
Express Route (sandbox.ts)
    ↓
Auth Middleware (requireAuth)
    ↓
Sandbox Service (sandboxService.ts)
    ↓
├── Prisma Client (Database)
└── E2B SDK (Sandbox Creation/Management)
```

---

## Database Schema

### Sandbox Model

```prisma
model Sandbox {
  id          String         @id @default(cuid())
  name        String
  description String?

  // E2B Sandbox tracking
  e2bSandboxId String?      @unique
  status       SandboxStatus @default(CREATING)

  // Ownership and associations
  userId    String
  projectId String? // Optional: link to specific project

  // Lifecycle management
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  expiresAt      DateTime
  lastAccessedAt DateTime @default(now())

  // TTL configuration (in seconds)
  ttl Int @default(3600) // Default 1 hour

  // Resource limits
  maxDiskSizeMB Int @default(1024) // Max 1GB disk
  maxMemoryMB   Int @default(512)  // Max 512MB RAM

  // Settings and metadata
  settings Json?
  metadata Json?

  // Relations
  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  project Project? @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([projectId])
  @@index([status])
  @@index([expiresAt])
  @@map("sandboxes")
}

enum SandboxStatus {
  CREATING
  ACTIVE
  PAUSED
  TERMINATED
  FAILED
}
```

---

## API Endpoints

### 1. Create Sandbox

**POST** `/api/sandboxes`

Creates a new sandbox for the authenticated user.

**Request:**
```json
{
  "name": "My Development Sandbox",
  "description": "Sandbox for Node.js development",
  "projectId": "optional-project-id",
  "ttl": 7200,
  "template": "base",
  "envVars": {
    "NODE_ENV": "development"
  },
  "metadata": {
    "purpose": "testing"
  }
}
```

**Response:** `201 Created`
```json
{
  "id": "sandbox-id",
  "name": "My Development Sandbox",
  "status": "CREATING",
  "userId": "user-id",
  "expiresAt": "2025-12-20T15:00:00Z",
  "ttl": 7200,
  ...
}
```

### 2. List Sandboxes

**GET** `/api/sandboxes?includeTerminated=false`

Lists all sandboxes for the authenticated user.

**Response:** `200 OK`
```json
{
  "sandboxes": [
    {
      "id": "sandbox-id",
      "name": "My Sandbox",
      "status": "ACTIVE",
      ...
    }
  ]
}
```

### 3. Get Sandbox

**GET** `/api/sandboxes/:id`

Retrieves details of a specific sandbox.

**Response:** `200 OK`

### 4. Delete Sandbox

**DELETE** `/api/sandboxes/:id`

Terminates and deletes a sandbox.

**Response:** `200 OK`
```json
{
  "message": "Sandbox terminated successfully"
}
```

### 5. Extend Timeout

**PUT** `/api/sandboxes/:id/timeout`

Extends the sandbox TTL.

**Request:**
```json
{
  "additionalSeconds": 3600
}
```

**Response:** `200 OK`

### 6. Pause Sandbox

**POST** `/api/sandboxes/:id/pause`

Pauses an active sandbox.

**Response:** `200 OK`

### 7. Resume Sandbox

**POST** `/api/sandboxes/:id/resume`

Resumes a paused sandbox.

**Response:** `200 OK`

### 8. Write File

**POST** `/api/sandboxes/:id/files`

Writes a file to the sandbox.

**Request:**
```json
{
  "path": "/home/user/app.js",
  "content": "console.log('Hello World');"
}
```

**Response:** `200 OK`

### 9. List Files

**GET** `/api/sandboxes/:id/files?path=/home/user`

Lists files in a directory.

**Response:** `200 OK`
```json
{
  "files": [
    {
      "name": "app.js",
      "type": "file",
      "path": "/home/user/app.js"
    }
  ],
  "path": "/home/user"
}
```

### 10. Read File

**GET** `/api/sandboxes/:id/files/read?path=/home/user/app.js`

Reads a file from the sandbox.

**Response:** `200 OK`
```json
{
  "content": "console.log('Hello World');",
  "path": "/home/user/app.js"
}
```

### 11. Delete File

**DELETE** `/api/sandboxes/:id/files?path=/home/user/app.js`

Deletes a file from the sandbox.

**Response:** `200 OK`

### 12. Execute Command

**POST** `/api/sandboxes/:id/commands`

Executes a shell command in the sandbox.

**Request:**
```json
{
  "command": "npm install",
  "workdir": "/home/user/project",
  "timeout": 30000
}
```

**Response:** `200 OK`
```json
{
  "stdout": "added 123 packages...",
  "stderr": "",
  "exitCode": 0
}
```

### 13. Update Settings

**PUT** `/api/sandboxes/:id/settings`

Updates sandbox settings.

**Request:**
```json
{
  "template": "nodejs",
  "envVars": {
    "NODE_VERSION": "18"
  },
  "metadata": {
    "updated": true
  }
}
```

**Response:** `200 OK`

### 14. Relaunch Sandbox

**POST** `/api/sandboxes/:id/relaunch`

Creates a new sandbox with the same settings as an existing one.

**Response:** `201 Created`

---

## Environment Configuration

Add these variables to your `.env` file:

```env
# E2B Configuration
E2B_API_KEY=your-e2b-api-key-here
E2B_TIMEOUT=30000

# Sandbox Configuration
SANDBOX_MAX_PER_USER=5              # Max concurrent sandboxes per user
SANDBOX_DEFAULT_TTL=3600            # Default TTL in seconds (1 hour)
SANDBOX_MAX_TTL=86400               # Maximum TTL in seconds (24 hours)
SANDBOX_CLEANUP_INTERVAL=60000      # Cleanup check interval in ms (1 minute)
```

### Configuration Details

| Variable | Description | Default | Type |
|----------|-------------|---------|------|
| `E2B_API_KEY` | Your E2B API key | Required | String |
| `E2B_TIMEOUT` | Default E2B operation timeout | 30000 | Number (ms) |
| `SANDBOX_MAX_PER_USER` | Max concurrent sandboxes | 5 | Number |
| `SANDBOX_DEFAULT_TTL` | Default sandbox lifetime | 3600 | Number (seconds) |
| `SANDBOX_MAX_TTL` | Maximum allowed TTL | 86400 | Number (seconds) |
| `SANDBOX_CLEANUP_INTERVAL` | Cleanup check frequency | 60000 | Number (ms) |

---

## Usage Examples

### Example 1: Create and Use a Sandbox

```javascript
// 1. Create a sandbox
const createResponse = await fetch('/api/sandboxes', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Node.js Dev Environment',
    ttl: 7200,
    template: 'nodejs'
  })
});

const sandbox = await createResponse.json();
const sandboxId = sandbox.id;

// 2. Write a file
await fetch(`/api/sandboxes/${sandboxId}/files`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    path: '/home/user/app.js',
    content: 'console.log("Hello from sandbox!");'
  })
});

// 3. Execute the file
const execResponse = await fetch(`/api/sandboxes/${sandboxId}/commands`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    command: 'node app.js',
    workdir: '/home/user'
  })
});

const result = await execResponse.json();
console.log(result.stdout); // "Hello from sandbox!"

// 4. Clean up
await fetch(`/api/sandboxes/${sandboxId}`, {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### Example 2: Project-Specific Sandbox

```javascript
// Create a sandbox linked to a project
const response = await fetch('/api/sandboxes', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Project Build Environment',
    projectId: 'my-project-id',
    ttl: 3600,
    envVars: {
      'BUILD_ENV': 'production',
      'NODE_ENV': 'production'
    }
  })
});
```

---

## Automatic Cleanup

The sandbox cleanup scheduler runs automatically in the background:

### How It Works

1. **Scheduler starts** when the server starts
2. **Runs every minute** (configurable via `SANDBOX_CLEANUP_INTERVAL`)
3. **Checks for expired sandboxes** where `expiresAt <= now()`
4. **Terminates E2B sandboxes** gracefully
5. **Updates database status** to `TERMINATED`
6. **Logs cleanup activity** for monitoring

### Manual Cleanup

You can also manually trigger cleanup in the code:

```typescript
import { cleanupExpiredSandboxes } from './services/sandboxService';

const result = await cleanupExpiredSandboxes();
console.log(`Cleaned up ${result.cleaned} sandboxes`);
```

---

## Security & Limits

### Authentication

All sandbox endpoints require JWT authentication via the `requireAuth` middleware.

### Authorization

- Users can only access their own sandboxes
- Ownership is verified on every operation
- Project association is validated if provided

### Rate Limiting

Consider implementing rate limiting for sandbox creation:

```typescript
// Recommended in production
app.use('/api/sandboxes', rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10 // Max 10 sandbox creations per window
}));
```

### Resource Limits

Default limits per sandbox:
- **Max Disk Size:** 1GB
- **Max Memory:** 512MB
- **Max Sandboxes per User:** 5 (configurable)
- **Max TTL:** 24 hours (configurable)

### Input Validation

All inputs are validated:
- File paths are sanitized
- Commands are executed in isolated environments
- Settings are validated before storage

---

## Migration Guide

### Step 1: Run Prisma Migration

```bash
# Generate migration
npx prisma migrate dev --name add_sandbox_model

# Or apply existing migrations
npx prisma migrate deploy
```

### Step 2: Update Environment

Add sandbox configuration to your `.env` file (see [Environment Configuration](#environment-configuration)).

### Step 3: Restart Server

The sandbox cleanup scheduler will start automatically.

### Step 4: Verify Installation

```bash
# Check server logs for:
# "Starting sandbox cleanup scheduler"
# "Server is running on http://localhost:6060"

# Test the API
curl -X POST http://localhost:6060/api/sandboxes \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Sandbox"}'
```

---

## Production Considerations

### 1. Database Indexes

The schema includes indexes on:
- `userId` - Fast user sandbox lookups
- `projectId` - Fast project sandbox lookups
- `status` - Fast status filtering
- `expiresAt` - Efficient cleanup queries

### 2. Monitoring

Monitor these metrics:
- Active sandboxes count
- Cleanup success rate
- E2B API errors
- Average sandbox lifetime

### 3. Error Handling

All operations include comprehensive error handling with:
- Status codes
- Error codes
- Descriptive messages
- Stack traces (development only)

### 4. Logging

Structured logging is implemented throughout:
```typescript
logger.info(`Sandbox created: ${id} for user: ${userId}`);
logger.error("Error creating sandbox:", error);
```

### 5. Graceful Shutdown

The server handles shutdown gracefully:
- Stops cleanup scheduler
- Closes HTTP server
- Exits cleanly

---

## Troubleshooting

### Issue: Sandboxes stuck in CREATING status

**Cause:** E2B API timeout or failure

**Solution:**
1. Check E2B_API_KEY is valid
2. Check E2B service status
3. Review server logs for E2B errors
4. Manually update status to FAILED if needed

### Issue: Cleanup not running

**Cause:** Scheduler not started or crashed

**Solution:**
1. Check server logs for "Starting sandbox cleanup scheduler"
2. Verify SANDBOX_CLEANUP_INTERVAL is set
3. Restart server

### Issue: User limit reached

**Cause:** User has too many active sandboxes

**Solution:**
1. User should delete unused sandboxes
2. Admin can increase SANDBOX_MAX_PER_USER
3. Or wait for sandboxes to expire naturally

---

## API Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `SANDBOX_LIMIT_REACHED` | 429 | User has reached max sandbox limit |
| `SANDBOX_NOT_FOUND` | 404 | Sandbox ID not found |
| `SANDBOX_NOT_READY` | 400 | Sandbox not fully initialized |
| `SANDBOX_TERMINATED` | 400 | Operation on terminated sandbox |
| `FORBIDDEN` | 403 | User not authorized for sandbox |
| `PROJECT_NOT_FOUND` | 404 | Associated project not found |
| `INVALID_STATUS` | 400 | Invalid status transition |
| `MISSING_FIELDS` | 400 | Required fields missing |

---

## Future Enhancements

Potential improvements:
1. WebSocket support for real-time command output
2. Sandbox templates management
3. Snapshot and restore functionality
4. Collaborative sandboxes (multiple users)
5. Resource usage metrics and billing
6. Custom disk/memory limits per user tier
7. Sandbox cloning
8. File upload/download via multipart

---

## Support

For issues or questions:
1. Check server logs
2. Review E2B documentation: https://e2b.dev/docs
3. Check Prisma schema migrations
4. Verify environment configuration

---

**Implementation Complete!** 🎉

All features are production-ready and follow best practices for security, performance, and maintainability.
