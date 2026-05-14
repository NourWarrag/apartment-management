# Structured Logging — Design Spec

## Goal

Add production-grade structured JSON logging to the Express backend: every HTTP request/response, every unhandled error, and every soft-delete action is logged with consistent fields. Dev gets pretty-printed output; prod writes to a rotating log file.

## Architecture

`pino` is the logger. `pino-http` middleware sits at the top of the Express stack, assigns a UUID `requestId` to every request, and automatically logs the request and response. The same `pino` instance is exported as `logger` for manual log calls in controllers and middleware. In production, output goes to `logs/app.log` via `pino-roll` (daily rotation, 7-day retention, 50 MB max per file).

---

## Dependencies

```bash
npm install pino pino-http pino-roll uuid
npm install --save-dev pino-pretty @types/uuid
```

---

## File: `server/src/lib/logger.ts` (new)

```typescript
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

---

## File: `server/src/middleware/requestLogger.middleware.ts` (new)

```typescript
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

---

## File: `server/src/middleware/auth.middleware.ts` (modify)

After verifying the JWT and setting `req.user`, attach the userId to the request's pino logger so it appears in all log lines for that request:

```typescript
// After: req.user = payload;
(req as AuthRequest & { log?: { setBindings: (b: object) => void } }).log?.setBindings({ userId: payload.id });
```

---

## File: `server/src/app.ts` (modify)

Register `requestLogger` as the **first** middleware, before auth and routes:

```typescript
import { requestLogger } from './middleware/requestLogger.middleware';

app.use(requestLogger);
// ... existing middleware
```

---

## File: `server/src/middleware/errorHandler.middleware.ts` (new)

A global Express error handler that logs the error with context before returning a 500:

```typescript
import { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const reqWithId = req as Request & { id?: string };
  logger.error({
    requestId: reqWithId.id,
    err,
    method: req.method,
    url: req.url,
  }, 'Unhandled error');

  res.status(500).json({ message: 'Internal server error' });
}
```

Register as the **last** middleware in `app.ts`:
```typescript
app.use(errorHandler);
```

---

## Soft-delete logging

In the Prisma soft-delete middleware (see audit-soft-delete spec), after setting `deletedAt`, log:

```typescript
import logger from '../lib/logger';

logger.info({
  entity: params.model,
  entityId: params.args.where?.id,
  deletedBy: getContextUserId(),
}, 'soft-delete');
```

---

## Log format (production JSON)

```json
{
  "level": 30,
  "time": 1747123456789,
  "requestId": "a1b2c3d4-...",
  "req": { "id": "a1b2c3d4-...", "method": "GET", "url": "/api/v1/payments", "userId": 7 },
  "res": { "statusCode": 200 },
  "responseTime": 42,
  "msg": "GET /api/v1/payments 200"
}
```

---

## File: `logs/` (gitignore)

Add to `.gitignore`:
```
logs/
```

---

## Log levels

| Level | Usage |
|---|---|
| `info` | Every request/response, soft deletes |
| `warn` | Auth failures (401/403), validation errors (400) |
| `error` | Unhandled exceptions, 500 responses |
| `debug` | Available via `LOG_LEVEL=debug` env var — not emitted in prod by default |

---

## Testing

1. Start server in dev — verify pretty-printed output appears in terminal for each request
2. Start server with `NODE_ENV=production` — verify `logs/app.log` is created and receives JSON lines
3. Make an unauthenticated request — verify `userId: null` in log
4. Trigger a 500 (e.g., kill DB) — verify error log includes `err.stack`
5. Verify `requestId` is consistent between the request log line and any error log for the same request
