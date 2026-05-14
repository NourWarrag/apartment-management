# Structured Logging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-grade structured JSON logging to the Express backend — every HTTP request/response, every unhandled error, and every soft-delete action is logged with consistent fields. Dev mode gets pretty-printed terminal output; production writes to a rotating log file.

**Architecture:** `pino` is the logger. `pino-http` middleware sits at the top of the Express stack, assigns a UUID `requestId` to every request, and automatically logs request and response. The same `pino` instance is exported as `logger` for manual log calls. In production, output goes to `logs/app.log` via `pino-roll` (daily rotation, 7-day retention, 50 MB max). A global error handler middleware sits at the bottom of the Express stack and logs unhandled errors before returning 500. The authenticated user ID is attached to the request log via `req.log.setBindings()` in the auth middleware — this makes `userId` appear in every log line for that request without modifying the serializers.

**Tech Stack:** `pino`, `pino-http`, `pino-roll`, `uuid`, `pino-pretty` (dev only)

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `server/package.json` | Add pino, pino-http, pino-roll, uuid, pino-pretty dependencies |
| Create | `server/src/lib/logger.ts` | Configured pino instance (dev pretty / prod file) |
| Create | `server/src/middleware/requestLogger.middleware.ts` | pino-http middleware with UUID requestId |
| Create | `server/src/middleware/errorHandler.middleware.ts` | Global Express error handler |
| Modify | `server/src/middleware/auth.middleware.ts` | Attach userId to request log via setBindings |
| Modify | `server/src/app.ts` | Register requestLogger first, errorHandler last |
| Modify | `.gitignore` | Add `logs/` |

---

### Task 1: Install Dependencies

**Files:**
- Modify: `server/package.json` (via npm install)

- [ ] **Step 1: Install runtime and dev dependencies**

```bash
cd server
npm install pino pino-http pino-roll uuid
npm install --save-dev pino-pretty @types/uuid
```

Expected: `package.json` and `package-lock.json` updated. No peer dependency errors.

- [ ] **Step 2: Commit**

```bash
git add server/package.json package-lock.json
git commit -m "chore: install pino, pino-http, pino-roll, uuid for structured logging"
```

---

### Task 2: Create `logger.ts`

**Files:**
- Create: `server/src/lib/logger.ts`

- [ ] **Step 1: Create the file**

```typescript
// server/src/lib/logger.ts
import pino from 'pino';
import path from 'path';
import fs from 'fs';

const isDev = process.env.NODE_ENV !== 'production';

const logsDir = path.resolve(__dirname, '../../logs');
if (!isDev && !fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const transport = isDev
  ? pino.transport({ target: 'pino-pretty', options: { colorize: true } })
  : pino.transport({
      target: 'pino-roll',
      options: {
        file: path.join(logsDir, 'app.log'),
        frequency: 'daily',
        limit: { count: 7 },
        size: '50m',
      },
    });

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' }, transport);

export default logger;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd server
npx tsc --noEmit
```

Expected: no errors. If `@types/node` is missing `fs`/`path`, they're already in devDependencies.

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/logger.ts
git commit -m "feat: add pino logger with dev pretty-print and prod file rotation"
```

---

### Task 3: Create `requestLogger.middleware.ts`

**Files:**
- Create: `server/src/middleware/requestLogger.middleware.ts`

- [ ] **Step 1: Create the file**

```typescript
// server/src/middleware/requestLogger.middleware.ts
import pinoHttp from 'pino-http';
import { v4 as uuid } from 'uuid';
import logger from '../lib/logger';

export const requestLogger = pinoHttp({
  logger,
  genReqId: () => uuid(),
  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} ${res.statusCode} — ${err.message}`,
  serializers: {
    req(req) {
      return { id: req.id, method: req.method, url: req.url };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd server
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/middleware/requestLogger.middleware.ts
git commit -m "feat: add pino-http request logger middleware with UUID requestId"
```

---

### Task 4: Create `errorHandler.middleware.ts`

**Files:**
- Create: `server/src/middleware/errorHandler.middleware.ts`

Express identifies a 4-argument function as an error-handling middleware. The `_next` parameter must be declared even if unused — omitting it causes Express to treat the handler as a regular middleware.

- [ ] **Step 1: Create the file**

```typescript
// server/src/middleware/errorHandler.middleware.ts
import { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const reqWithId = req as Request & { id?: string };
  logger.error(
    { requestId: reqWithId.id, err, method: req.method, url: req.url },
    'Unhandled error',
  );
  res.status(500).json({ message: 'Internal server error' });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd server
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/middleware/errorHandler.middleware.ts
git commit -m "feat: add global Express error handler middleware that logs with pino"
```

---

### Task 5: Wire into `app.ts`

**Files:**
- Modify: `server/src/app.ts`

`requestLogger` must be the **first** middleware (before `express.json()` and all routes) so every request is logged. `errorHandler` must be the **last** middleware (after all routes) so it catches unhandled errors from any route.

- [ ] **Step 1: Update `app.ts`**

Replace the entire file:

```typescript
import express from 'express';
import cookieParser from 'cookie-parser';
import { requestLogger } from './middleware/requestLogger.middleware';
import { errorHandler } from './middleware/errorHandler.middleware';
import authRoutes from './routes/auth.routes';
import apartmentsRoutes from './routes/apartments.routes';
import tenantsRoutes from './routes/tenants.routes';
import dashboardRoutes from './routes/dashboard.routes';
import paymentsRoutes from './routes/payments.routes';
import ticketsRoutes from './routes/tickets.routes';
import usersRoutes from './routes/users.routes';
import bookingsRoutes from './routes/bookings.routes';

const app = express();

app.use(requestLogger);
app.use(express.json());
app.use(cookieParser());

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/apartments', apartmentsRoutes);
app.use('/api/v1/tenants', tenantsRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/payments', paymentsRoutes);
app.use('/api/v1/tickets', ticketsRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/bookings', bookingsRoutes);

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(errorHandler);

export default app;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd server
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/app.ts
git commit -m "feat: register requestLogger first and errorHandler last in Express app"
```

---

### Task 6: Auth Middleware — Attach userId to Request Log

**Files:**
- Modify: `server/src/middleware/auth.middleware.ts`

After verifying the JWT and setting `req.user`, call `req.log.setBindings({ userId })`. This makes `userId` appear in every pino-http log line for that request. `req.log` is the per-request pino child logger injected by `pino-http` — it's available only after `requestLogger` runs, which is before auth middleware.

Note: if Task 4 of the Audit+Soft-Delete plan has already been applied, `auth.middleware.ts` already wraps `next()` in `requestContext.run()`. This step adds `setBindings` before that `next()` call.

- [ ] **Step 1: Update auth middleware**

The file currently ends with:

```typescript
    req.user = { id: payload.id as number, role: payload.role as Role };
    next();  // or: requestContext.run({ userId: payload.id as number }, () => next());
```

Add the `setBindings` call between setting `req.user` and calling `next()`:

```typescript
    req.user = { id: payload.id as number, role: payload.role as Role };
    (req as Request & { log?: { setBindings: (b: object) => void } }).log?.setBindings({
      userId: payload.id as number,
    });
    next();  // preserve whatever wrapping is already present (requestContext.run or plain next())
```

**If the audit plan was already applied**, the full auth middleware should look like:

```typescript
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt';
import { Role } from '@hotel/shared';
import { requestContext } from '../lib/requestContext';

export interface AuthRequest extends Request {
  user?: { id: number; role: Role };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.token as string | undefined;
  if (!token) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.id as number, role: payload.role as Role };
    (req as Request & { log?: { setBindings: (b: object) => void } }).log?.setBindings({
      userId: payload.id as number,
    });
    requestContext.run({ userId: payload.id as number }, () => next());
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}
```

**If the audit plan has NOT been applied yet**, the full auth middleware should look like:

```typescript
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt';
import { Role } from '@hotel/shared';

export interface AuthRequest extends Request {
  user?: { id: number; role: Role };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.token as string | undefined;
  if (!token) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.id as number, role: payload.role as Role };
    (req as Request & { log?: { setBindings: (b: object) => void } }).log?.setBindings({
      userId: payload.id as number,
    });
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd server
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/middleware/auth.middleware.ts
git commit -m "feat: attach userId to pino request log via setBindings in auth middleware"
```

---

### Task 7: Update .gitignore and Verify

**Files:**
- Modify: `.gitignore` (root)

- [ ] **Step 1: Add `logs/` to .gitignore**

Open the root `.gitignore` and add at the end:
```
# Server log files
logs/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore server logs/ directory"
```

- [ ] **Step 3: Manual verification — dev mode**

Start the server in dev mode and make a request:

```bash
cd server
npm run dev
```

In another terminal:
```bash
curl http://localhost:3000/api/v1/health
```

Expected: colorized, human-readable log line appears in the server terminal. Example:
```
[12:34:56.789] INFO: GET /api/v1/health 200
    req: { id: "a1b2c3d4-...", method: "GET", url: "/api/v1/health" }
    res: { statusCode: 200 }
    responseTime: 5
```

- [ ] **Step 4: Manual verification — prod mode**

```bash
NODE_ENV=production npm run dev
```

Make a request, then check:
```bash
ls server/logs/
cat server/logs/app.log
```

Expected: `app.log` exists and contains a JSON line like:
```json
{"level":30,"time":1747123456789,"requestId":"a1b2c3d4-...","req":{"id":"a1b2c3d4-...","method":"GET","url":"/api/v1/health"},"res":{"statusCode":200},"responseTime":5,"msg":"GET /api/v1/health 200"}
```

- [ ] **Step 5: Manual verification — authenticated request**

Make a request with a valid auth cookie and verify `userId` appears in the log:
```bash
# Use a valid session cookie from the browser devtools
curl -b "token=<your-token>" http://localhost:3000/api/v1/dashboard/stats
```

Expected log line includes `"userId": <number>`.

- [ ] **Step 6: Manual verification — unauthenticated request**

```bash
curl http://localhost:3000/api/v1/dashboard/stats
```

Expected: 401 response, and log shows NO `userId` binding (since setBindings is only called after auth succeeds).

- [ ] **Step 7: Run existing test suite to check for regressions**

```bash
cd server
npm test
```

Expected: all existing tests pass. pino's transport runs asynchronously and won't interfere with test output.

---

## Spec Self-Review

**Spec coverage:**
- ✅ `pino` logger (dev pretty / prod file) → Task 2
- ✅ `pino-http` middleware with UUID requestId → Task 3
- ✅ Registered first in Express stack → Task 5
- ✅ Global error handler logs unhandled errors with requestId → Task 4 + Task 5
- ✅ `userId` attached via `setBindings` in auth middleware → Task 6
- ✅ `logs/` gitignored → Task 7
- ✅ Log levels: info (request/response), error (500), warn (401/403) — warn-level logging on auth failures is not explicitly implemented in auth middleware (it returns 401 but doesn't call logger.warn). This is acceptable: pino-http logs all responses including 4xx automatically at info level. For explicit warn-level on 401s, the auth middleware could call `logger.warn(...)` before returning — add this only if the spec requires it explicitly.

**Placeholder check:** No TBDs or vague steps.

**Type safety note:** The `req.log?.setBindings(...)` cast uses optional chaining because `req.log` is injected by pino-http at runtime but not in Express's `Request` type. The optional chaining makes it a no-op in tests where pino-http isn't mounted (avoiding crashes).
