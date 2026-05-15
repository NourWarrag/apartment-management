# Hotel Apartment Management System — Phase 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the complete monorepo skeleton — Prisma schema, Express API with JWT auth, React+Vite+Tailwind client with the full layout shell (top bar, collapsed sidebar), bilingual i18n (EN/AR + RTL), protected routes, and Zustand UI store.

**Architecture:** Monorepo with `/client` (React+Vite), `/server` (Express+Prisma), and `/shared` (TypeScript enums+DTOs). Auth uses JWT in httpOnly cookies. Layout is a top bar + 52px icon sidebar that mirrors for RTL. All server tests use Vitest + Supertest against a real test database.

**Tech Stack:** React 18, Vite, Tailwind CSS 3, react-i18next, Zustand, React Query v5, Axios, Express, Prisma, PostgreSQL, Vitest, Supertest, Lucide React, bcryptjs, jsonwebtoken

---

## File Map

```
/hotel-admin
  package.json                          ← monorepo root (workspaces)
  .gitignore

  /shared
    package.json
    index.ts                            ← enums + DTO types

  /server
    package.json
    tsconfig.json
    .env.example
    src/
      index.ts                          ← starts HTTP server
      app.ts                            ← Express app (middleware, routes mount)
      lib/
        jwt.ts                          ← sign / verify helpers
        password.ts                     ← hash / compare helpers
      middleware/
        auth.middleware.ts              ← validates JWT cookie
        role.middleware.ts              ← enforces Role enum
      routes/
        auth.routes.ts
      controllers/
        auth.controller.ts
    prisma/
      schema.prisma                     ← full data model (all models)
    tests/
      auth.test.ts

  /client
    package.json
    vite.config.ts
    tailwind.config.ts
    postcss.config.ts
    index.html
    src/
      main.tsx                          ← React root, QueryClientProvider, i18n init
      App.tsx                           ← React Router routes
      lib/
        axios.ts                        ← Axios instance (withCredentials, base URL)
        queryClient.ts                  ← React Query client config
      store/
        ui.store.ts                     ← Zustand: { locale, sidebarOpen }
      i18n/
        index.ts                        ← i18next init
        locales/en/translation.json
        locales/ar/translation.json
      hooks/
        useAuth.ts                      ← useQuery wrapper for /api/v1/auth/me
      components/
        layout/
          AppLayout.tsx                 ← wraps authenticated pages
          TopBar.tsx                    ← brand, lang toggle, bell, user menu
          Sidebar.tsx                   ← 52px icon sidebar, active highlight
        auth/
          ProtectedRoute.tsx            ← redirects by role
      pages/
        auth/
          LoginPage.tsx
```

---

## Task 1: Monorepo Root + Shared Package

**Files:**
- Create: `package.json` (root)
- Create: `.gitignore`
- Create: `shared/package.json`
- Create: `shared/index.ts`

- [ ] **Step 1: Create root package.json with npm workspaces**

```json
{
  "name": "hotel-admin",
  "version": "1.0.0",
  "private": true,
  "workspaces": ["shared", "server", "client"],
  "scripts": {
    "dev:server": "npm run dev --workspace=server",
    "dev:client": "npm run dev --workspace=client",
    "test:server": "npm run test --workspace=server"
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules
dist
.env
.env.local
*.tsbuildinfo
.superpowers
```

- [ ] **Step 3: Create shared/package.json**

```json
{
  "name": "@hotel/shared",
  "version": "1.0.0",
  "main": "index.ts",
  "types": "index.ts"
}
```

- [ ] **Step 4: Create shared/index.ts with all enums and core DTOs**

```typescript
export enum Role {
  ADMIN = 'ADMIN',
  RECEPTIONIST = 'RECEPTIONIST',
  MAINTENANCE = 'MAINTENANCE',
  FINANCE = 'FINANCE',
}

export enum ApartmentStatus {
  AVAILABLE = 'AVAILABLE',
  OCCUPIED = 'OCCUPIED',
  MAINTENANCE = 'MAINTENANCE',
  RESERVED = 'RESERVED',
  CLEANING = 'CLEANING',
  PENDING_CHECKOUT = 'PENDING_CHECKOUT',
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  INSTALLMENT = 'INSTALLMENT',
}

export enum PaymentStatus {
  PAID = 'PAID',
  PENDING = 'PENDING',
  FAILED = 'FAILED',
}

export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum TicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CLOSED = 'CLOSED',
}

export interface ApiError {
  message: string;
  field?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}
```

- [ ] **Step 5: Commit**

```bash
git init
git add package.json .gitignore shared/
git commit -m "feat: monorepo root and shared types package"
```

---

## Task 2: Prisma Schema + Database Setup

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/.env.example`
- Create: `server/prisma/schema.prisma`

- [ ] **Step 1: Create server/package.json**

```json
{
  "name": "@hotel/server",
  "version": "1.0.0",
  "scripts": {
    "dev": "ts-node-dev --respawn src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:seed": "ts-node prisma/seed.ts"
  },
  "dependencies": {
    "@hotel/shared": "*",
    "@prisma/client": "^5.0.0",
    "bcryptjs": "^2.4.3",
    "cookie-parser": "^1.4.6",
    "express": "^4.18.0",
    "jsonwebtoken": "^9.0.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cookie-parser": "^1.4.7",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/node": "^20.0.0",
    "@types/supertest": "^6.0.2",
    "prisma": "^5.0.0",
    "supertest": "^6.3.4",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  }
}
```

- [ ] **Step 2: Create server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "paths": {
      "@hotel/shared": ["../shared/index.ts"]
    }
  },
  "include": ["src", "tests", "prisma"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create server/.env.example**

```
DATABASE_URL="postgresql://user:password@localhost:5432/hotel_dev"
TEST_DATABASE_URL="postgresql://user:password@localhost:5432/hotel_test"
JWT_SECRET="change-me-in-production-use-32-char-min"
JWT_EXPIRES_IN="7d"
PORT=3001
NODE_ENV=development
```

Copy to `.env` and fill in real values.

- [ ] **Step 4: Create server/prisma/schema.prisma**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        Int      @id @default(autoincrement())
  name      String
  email     String   @unique
  password  String
  role      Role
  createdAt DateTime @default(now())
  tickets   MaintenanceTicket[]
  auditLogs AuditLog[]
}

model Apartment {
  id       Int             @id @default(autoincrement())
  number   String          @unique
  floor    Int
  status   ApartmentStatus @default(AVAILABLE)
  bookings Booking[]
  tickets  MaintenanceTicket[]
}

model Tenant {
  id        Int       @id @default(autoincrement())
  fullName  String
  phone     String
  idNumber  String    @unique
  bookings  Booking[]
  createdAt DateTime  @default(now())
}

model Booking {
  id          Int       @id @default(autoincrement())
  apartmentId Int
  tenantId    Int
  checkIn     DateTime
  checkOut    DateTime
  totalAmount Decimal   @db.Decimal(10, 2)
  apartment   Apartment @relation(fields: [apartmentId], references: [id])
  tenant      Tenant    @relation(fields: [tenantId], references: [id])
  payments    Payment[]
  createdAt   DateTime  @default(now())
}

model Payment {
  id              Int           @id @default(autoincrement())
  bookingId       Int
  method          PaymentMethod
  amount          Decimal       @db.Decimal(10, 2)
  status          PaymentStatus @default(PENDING)
  referenceNumber String?
  paidAt          DateTime?
  booking         Booking       @relation(fields: [bookingId], references: [id])
  createdAt       DateTime      @default(now())
}

model MaintenanceTicket {
  id           Int          @id @default(autoincrement())
  apartmentId  Int
  description  String
  priority     Priority
  status       TicketStatus @default(OPEN)
  assignedToId Int?
  notes        String?
  apartment    Apartment    @relation(fields: [apartmentId], references: [id])
  assignedTo   User?        @relation(fields: [assignedToId], references: [id])
  createdAt    DateTime     @default(now())
  resolvedAt   DateTime?
}

model AuditLog {
  id        Int      @id @default(autoincrement())
  entity    String   // "PAYMENT" | "TICKET"
  entityId  Int      // ID of the related Payment or MaintenanceTicket
  action    String   // e.g. "CREATED", "STATUS_CHANGED", "PAID"
  userId    Int
  metadata  Json?
  user      User     @relation(fields: [userId], references: [id])
  createdAt DateTime @default(now())
}

enum Role               { ADMIN RECEPTIONIST MAINTENANCE FINANCE }
enum ApartmentStatus    { AVAILABLE OCCUPIED MAINTENANCE RESERVED CLEANING PENDING_CHECKOUT }
enum PaymentMethod      { CASH CARD INSTALLMENT }
enum PaymentStatus      { PAID PENDING FAILED }
enum Priority           { LOW MEDIUM HIGH }
enum TicketStatus       { OPEN IN_PROGRESS COMPLETED CLOSED }
```

- [ ] **Step 5: Install server dependencies and run migration**

```bash
cd server
npm install
npx prisma migrate dev --name init
npx prisma generate
```

Expected: Migration applied, Prisma client generated.

- [ ] **Step 6: Commit**

```bash
git add server/
git commit -m "feat: prisma schema with full data model and initial migration"
```

---

## Task 3: Express App + Auth Helpers

**Files:**
- Create: `server/src/lib/jwt.ts`
- Create: `server/src/lib/password.ts`
- Create: `server/src/app.ts`
- Create: `server/src/index.ts`

- [ ] **Step 1: Write failing test for JWT helpers**

Create `server/tests/jwt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { signToken, verifyToken } from '../src/lib/jwt';

describe('jwt helpers', () => {
  it('signs and verifies a payload', () => {
    const payload = { id: 1, role: 'ADMIN' };
    const token = signToken(payload);
    const decoded = verifyToken(token);
    expect(decoded).toMatchObject(payload);
  });

  it('throws on invalid token', () => {
    expect(() => verifyToken('bad-token')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server && npx vitest run tests/jwt.test.ts
```

Expected: FAIL — `Cannot find module '../src/lib/jwt'`

- [ ] **Step 3: Implement server/src/lib/jwt.ts**

```typescript
import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET ?? 'dev-secret';
const expiresIn = process.env.JWT_EXPIRES_IN ?? '7d';

export function signToken(payload: object): string {
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, secret) as jwt.JwtPayload;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/jwt.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Write failing test for password helpers**

Create `server/tests/password.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword } from '../src/lib/password';

describe('password helpers', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('secret123');
    expect(hash).not.toBe('secret123');
    expect(await comparePassword('secret123', hash)).toBe(true);
  });

  it('returns false for wrong password', async () => {
    const hash = await hashPassword('secret123');
    expect(await comparePassword('wrong', hash)).toBe(false);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npx vitest run tests/password.test.ts
```

Expected: FAIL — `Cannot find module '../src/lib/password'`

- [ ] **Step 7: Implement server/src/lib/password.ts**

```typescript
import bcrypt from 'bcryptjs';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 8: Run test to verify it passes**

```bash
npx vitest run tests/password.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 9: Create server/src/app.ts**

```typescript
import express from 'express';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes';

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use('/api/v1/auth', authRoutes);

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export default app;
```

- [ ] **Step 10: Create server/src/index.ts**

```typescript
import 'dotenv/config';
import app from './app';

const port = process.env.PORT ?? 3001;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
```

- [ ] **Step 11: Commit**

```bash
git add server/src/ server/tests/jwt.test.ts server/tests/password.test.ts
git commit -m "feat: express app skeleton and auth helpers (jwt, password)"
```

---

## Task 4: Auth Middleware + Login Endpoint

**Files:**
- Create: `server/src/middleware/auth.middleware.ts`
- Create: `server/src/middleware/role.middleware.ts`
- Create: `server/src/controllers/auth.controller.ts`
- Create: `server/src/routes/auth.routes.ts`
- Create: `server/tests/auth.test.ts`

- [ ] **Step 1: Create server/src/middleware/auth.middleware.ts**

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
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}
```

- [ ] **Step 2: Create server/src/middleware/role.middleware.ts**

```typescript
import { Response, NextFunction } from 'express';
import { Role } from '@hotel/shared';
import { AuthRequest } from './auth.middleware';

export function requireRole(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }
    next();
  };
}
```

- [ ] **Step 3: Write failing auth integration test**

Create `server/tests/auth.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/app';
import { hashPassword } from '../src/lib/password';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

beforeAll(async () => {
  await prisma.user.deleteMany();
  await prisma.user.create({
    data: {
      name: 'Test Admin',
      email: 'admin@test.com',
      password: await hashPassword('password123'),
      role: 'ADMIN',
    },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe('POST /api/v1/auth/login', () => {
  it('returns 200 and sets cookie on valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('admin@test.com');
    expect(res.body.user.role).toBe('ADMIN');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('returns 401 on unknown email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@test.com', password: 'password123' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns 401 without cookie', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns user when authenticated', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' });
    const cookie = loginRes.headers['set-cookie'][0];

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('admin@test.com');
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('clears the cookie', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' });
    const cookie = loginRes.headers['set-cookie'][0];

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    const clearedCookie = res.headers['set-cookie'][0];
    expect(clearedCookie).toMatch(/token=;/);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
DATABASE_URL=$TEST_DATABASE_URL npx vitest run tests/auth.test.ts
```

Expected: FAIL — routes not defined yet

- [ ] **Step 5: Create server/src/controllers/auth.controller.ts**

```typescript
import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
import { comparePassword } from '../lib/password';
import { signToken } from '../lib/jwt';

const prisma = new PrismaClient();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export async function login(req: AuthRequest, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await comparePassword(password, user.password))) {
    res.status(401).json({ message: 'Invalid credentials' });
    return;
  }
  const token = signToken({ id: user.id, role: user.role });
  res.cookie('token', token, COOKIE_OPTIONS);
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}

export function logout(_req: AuthRequest, res: Response): void {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
}

export function me(req: AuthRequest, res: Response): void {
  res.json(req.user);
}
```

- [ ] **Step 6: Create server/src/routes/auth.routes.ts**

```typescript
import { Router } from 'express';
import { login, logout, me } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', authMiddleware, me);

export default router;
```

- [ ] **Step 7: Run auth tests to verify they pass**

```bash
DATABASE_URL=$TEST_DATABASE_URL npx vitest run tests/auth.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 8: Commit**

```bash
git add server/src/middleware/ server/src/controllers/ server/src/routes/ server/tests/auth.test.ts
git commit -m "feat: auth endpoints (login, logout, me) with JWT httpOnly cookie"
```

---

## Task 5: React + Vite Client Setup

**Files:**
- Create: `client/package.json`
- Create: `client/vite.config.ts`
- Create: `client/tailwind.config.ts`
- Create: `client/postcss.config.ts`
- Create: `client/index.html`
- Create: `client/src/lib/axios.ts`
- Create: `client/src/lib/queryClient.ts`

- [ ] **Step 1: Create client/package.json**

```json
{
  "name": "@hotel/client",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@hotel/shared": "*",
    "@tanstack/react-query": "^5.0.0",
    "axios": "^1.6.0",
    "lucide-react": "^0.400.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-hot-toast": "^2.4.1",
    "react-i18next": "^14.0.0",
    "i18next": "^23.0.0",
    "react-router-dom": "^6.21.0",
    "recharts": "^2.10.0",
    "zustand": "^4.4.0",
    "react-hook-form": "^7.49.0",
    "zod": "^3.22.0",
    "@hookform/resolvers": "^3.3.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create client/vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  resolve: {
    alias: {
      '@hotel/shared': '../shared/index.ts',
    },
  },
});
```

- [ ] **Step 3: Create client/tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#b45309',
          dark: '#92400e',
          darker: '#78350f',
        },
        surface: '#fffbf5',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 4: Create client/postcss.config.ts**

```typescript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 5: Create client/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Hotel Apartment Management</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create client/src/lib/axios.ts**

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
```

- [ ] **Step 7: Create client/src/lib/queryClient.ts**

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});
```

- [ ] **Step 8: Install client dependencies**

```bash
cd client && npm install
```

Expected: Dependencies installed, no errors.

- [ ] **Step 9: Commit**

```bash
git add client/
git commit -m "feat: React+Vite+Tailwind client scaffold with axios and React Query setup"
```

---

## Task 6: i18n Setup (EN + AR/RTL)

**Files:**
- Create: `client/src/i18n/index.ts`
- Create: `client/src/i18n/locales/en/translation.json`
- Create: `client/src/i18n/locales/ar/translation.json`
- Create: `client/src/store/ui.store.ts`

- [ ] **Step 1: Create client/src/i18n/locales/en/translation.json**

```json
{
  "nav": {
    "dashboard": "Dashboard",
    "apartments": "Apartments",
    "tenants": "Tenants",
    "payments": "Payments",
    "tickets": "Maintenance",
    "reports": "Reports"
  },
  "auth": {
    "login": "Login",
    "logout": "Logout",
    "email": "Email",
    "password": "Password",
    "loginButton": "Sign In"
  },
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "add": "Add",
    "search": "Search",
    "loading": "Loading...",
    "noData": "No data found",
    "viewAll": "View all",
    "exportPdf": "Export PDF",
    "print": "Print"
  },
  "dashboard": {
    "title": "Dashboard",
    "totalApartments": "Total Apartments",
    "occupied": "Occupied",
    "available": "Available",
    "todayRevenue": "Today's Revenue",
    "pendingInstallments": "Pending Installments",
    "openTickets": "Open Tickets",
    "weeklyRevenue": "Weekly Revenue (AED)",
    "occupancyRate": "Occupancy Rate",
    "recentPayments": "Recent Payments"
  },
  "status": {
    "AVAILABLE": "Available",
    "OCCUPIED": "Occupied",
    "MAINTENANCE": "Maintenance",
    "RESERVED": "Reserved",
    "CLEANING": "Cleaning",
    "PENDING_CHECKOUT": "Pending Checkout",
    "OPEN": "Open",
    "IN_PROGRESS": "In Progress",
    "COMPLETED": "Completed",
    "CLOSED": "Closed",
    "PAID": "Paid",
    "PENDING": "Pending",
    "FAILED": "Failed"
  }
}
```

- [ ] **Step 2: Create client/src/i18n/locales/ar/translation.json**

```json
{
  "nav": {
    "dashboard": "لوحة التحكم",
    "apartments": "الشقق",
    "tenants": "المستأجرون",
    "payments": "المدفوعات",
    "tickets": "الصيانة",
    "reports": "التقارير"
  },
  "auth": {
    "login": "تسجيل الدخول",
    "logout": "تسجيل الخروج",
    "email": "البريد الإلكتروني",
    "password": "كلمة المرور",
    "loginButton": "دخول"
  },
  "common": {
    "save": "حفظ",
    "cancel": "إلغاء",
    "delete": "حذف",
    "edit": "تعديل",
    "add": "إضافة",
    "search": "بحث",
    "loading": "جار التحميل...",
    "noData": "لا توجد بيانات",
    "viewAll": "عرض الكل",
    "exportPdf": "تصدير PDF",
    "print": "طباعة"
  },
  "dashboard": {
    "title": "لوحة التحكم",
    "totalApartments": "إجمالي الشقق",
    "occupied": "مشغولة",
    "available": "متاحة",
    "todayRevenue": "إيرادات اليوم",
    "pendingInstallments": "الأقساط المعلقة",
    "openTickets": "التذاكر المفتوحة",
    "weeklyRevenue": "الإيرادات الأسبوعية (درهم)",
    "occupancyRate": "معدل الإشغال",
    "recentPayments": "المدفوعات الأخيرة"
  },
  "status": {
    "AVAILABLE": "متاح",
    "OCCUPIED": "مشغول",
    "MAINTENANCE": "صيانة",
    "RESERVED": "محجوز",
    "CLEANING": "تنظيف",
    "PENDING_CHECKOUT": "في انتظار المغادرة",
    "OPEN": "مفتوح",
    "IN_PROGRESS": "قيد التنفيذ",
    "COMPLETED": "مكتمل",
    "CLOSED": "مغلق",
    "PAID": "مدفوع",
    "PENDING": "معلق",
    "FAILED": "فاشل"
  }
}
```

- [ ] **Step 3: Create client/src/i18n/index.ts**

```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en/translation.json';
import ar from './locales/ar/translation.json';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: 'en' | 'ar'): void {
  i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

export default i18n;
```

- [ ] **Step 4: Create client/src/store/ui.store.ts**

```typescript
import { create } from 'zustand';
import { setLanguage } from '../i18n';

interface UIStore {
  locale: 'en' | 'ar';
  sidebarExpanded: boolean;
  toggleLocale: () => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIStore>((set, get) => ({
  locale: 'en',
  sidebarExpanded: false,
  toggleLocale: () => {
    const next = get().locale === 'en' ? 'ar' : 'en';
    setLanguage(next);
    set({ locale: next });
  },
  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
}));
```

- [ ] **Step 5: Commit**

```bash
git add client/src/i18n/ client/src/store/
git commit -m "feat: i18n setup with EN/AR translations and RTL toggle via Zustand"
```

---

## Task 7: App Layout Shell (TopBar + Sidebar)

**Files:**
- Create: `client/src/hooks/useAuth.ts`
- Create: `client/src/components/layout/TopBar.tsx`
- Create: `client/src/components/layout/Sidebar.tsx`
- Create: `client/src/components/layout/AppLayout.tsx`
- Create: `client/src/components/auth/ProtectedRoute.tsx`

- [ ] **Step 1: Create client/src/hooks/useAuth.ts**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';
import { AuthUser } from '@hotel/shared';

export function useAuth() {
  return useQuery<AuthUser>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
    retry: false,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      queryClient.clear();
      window.location.href = '/login';
    },
  });
}
```

- [ ] **Step 2: Create client/src/components/layout/TopBar.tsx**

```tsx
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/ui.store';
import { useAuth, useLogout } from '../../hooks/useAuth';

export default function TopBar() {
  const { t } = useTranslation();
  const { locale, toggleLocale } = useUIStore();
  const { data: user } = useAuth();
  const logout = useLogout();

  return (
    <header className="h-12 bg-[#92400e] flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-white font-bold text-sm">Hotel Apartments</span>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={toggleLocale}
          className="text-white text-xs bg-white/15 rounded-full px-3 py-1 font-semibold tracking-wide hover:bg-white/25 transition"
        >
          {locale === 'en' ? 'EN | عر' : 'عر | EN'}
        </button>
        <Bell size={16} className="text-white/80 cursor-pointer hover:text-white" />
        <div className="relative group">
          <button className="flex items-center gap-2 bg-white/15 rounded-full px-3 py-1 text-white text-xs hover:bg-white/25 transition">
            <span>{user?.name ?? '...'}</span>
          </button>
          <div className="hidden group-hover:block absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg py-1 min-w-28 z-50">
            <button
              onClick={() => logout.mutate()}
              className="w-full text-left px-4 py-2 text-sm text-amber-900 hover:bg-amber-50"
            >
              {t('auth.logout')}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Create client/src/components/layout/Sidebar.tsx**

```tsx
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Building2, Users, CreditCard, Wrench, BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/ui.store';
import { Role } from '@hotel/shared';
import { useAuth } from '../../hooks/useAuth';

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, key: 'dashboard', roles: [Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE] },
  { to: '/apartments', icon: Building2, key: 'apartments', roles: [Role.ADMIN, Role.RECEPTIONIST] },
  { to: '/tenants', icon: Users, key: 'tenants', roles: [Role.ADMIN, Role.RECEPTIONIST] },
  { to: '/payments', icon: CreditCard, key: 'payments', roles: [Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE] },
  { to: '/tickets', icon: Wrench, key: 'tickets', roles: [Role.ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE] },
  { to: '/reports', icon: BarChart3, key: 'reports', roles: [Role.ADMIN, Role.FINANCE] },
];

export default function Sidebar() {
  const { t } = useTranslation();
  const { sidebarExpanded } = useUIStore();
  const { data: user } = useAuth();

  const visibleItems = NAV_ITEMS.filter(
    (item) => user && item.roles.includes(user.role as Role)
  );

  return (
    <nav
      className={`bg-[#78350f] flex flex-col items-center py-3 gap-1 shrink-0 transition-all duration-200 ${
        sidebarExpanded ? 'w-44' : 'w-[52px]'
      }`}
    >
      {visibleItems.map(({ to, icon: Icon, key }) => (
        <NavLink
          key={to}
          to={to}
          title={t(`nav.${key}`)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-2 py-2 w-[38px] ${sidebarExpanded ? 'w-36' : ''} transition-colors ${
              isActive ? 'bg-white/22' : 'hover:bg-white/10'
            }`
          }
        >
          <Icon size={16} className="text-white shrink-0" />
          {sidebarExpanded && (
            <span className="text-white text-xs font-medium truncate">{t(`nav.${key}`)}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Create client/src/components/layout/AppLayout.tsx**

```tsx
import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import Sidebar from './Sidebar';

export default function AppLayout() {
  return (
    <div className="h-screen flex flex-col bg-surface overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create client/src/components/auth/ProtectedRoute.tsx**

```tsx
import { Navigate } from 'react-router-dom';
import { Role } from '@hotel/shared';
import { useAuth } from '../../hooks/useAuth';

interface Props {
  allowedRoles: Role[];
  children: React.ReactNode;
}

export default function ProtectedRoute({ allowedRoles, children }: Props) {
  const { data: user, isLoading, isError } = useAuth();

  if (isLoading) return <div className="p-8 text-amber-700">Loading...</div>;
  if (isError || !user) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(user.role as Role)) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}
```

- [ ] **Step 6: Commit**

```bash
git add client/src/hooks/ client/src/components/
git commit -m "feat: app layout shell with top bar, sidebar, and protected routes"
```

---

## Task 8: Login Page + App Router

**Files:**
- Create: `client/src/pages/auth/LoginPage.tsx`
- Create: `client/src/main.tsx`
- Create: `client/src/App.tsx`
- Create: `client/src/index.css`

- [ ] **Step 1: Create client/src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

[dir="rtl"] .rtl-flip {
  transform: scaleX(-1);
}
```

- [ ] **Step 2: Create client/src/pages/auth/LoginPage.tsx**

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../lib/axios';
import { LoginDto, Role } from '@hotel/shared';
import { useTranslation } from 'react-i18next';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const ROLE_REDIRECTS: Record<Role, string> = {
  [Role.ADMIN]: '/dashboard',
  [Role.RECEPTIONIST]: '/dashboard',
  [Role.MAINTENANCE]: '/tickets',
  [Role.FINANCE]: '/reports',
};

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { register, handleSubmit, formState: { errors } } = useForm<LoginDto>({
    resolver: zodResolver(schema),
  });

  const loginMutation = useMutation({
    mutationFn: (data: LoginDto) => api.post('/auth/login', data),
    onSuccess: (res) => {
      queryClient.setQueryData(['auth', 'me'], res.data.user);
      navigate(ROLE_REDIRECTS[res.data.user.role as Role] ?? '/dashboard');
    },
    onError: () => toast.error('Invalid email or password'),
  });

  return (
    <div className="min-h-screen bg-[#fffbf5] flex items-center justify-center">
      <div className="bg-white border border-amber-200 rounded-xl shadow-sm p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold text-amber-900">Hotel Apartments</h1>
          <p className="text-sm text-amber-700 mt-1">{t('auth.login')}</p>
        </div>
        <form onSubmit={handleSubmit((d) => loginMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-amber-900 mb-1">
              {t('auth.email')}
            </label>
            <input
              {...register('email')}
              type="email"
              className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-[#fffbf5]"
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-amber-900 mb-1">
              {t('auth.password')}
            </label>
            <input
              {...register('password')}
              type="password"
              className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-[#fffbf5]"
            />
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
          </div>
          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full bg-[#b45309] hover:bg-[#92400e] text-white font-semibold rounded-lg py-2 text-sm transition disabled:opacity-60"
          >
            {loginMutation.isPending ? t('common.loading') : t('auth.loginButton')}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create client/src/App.tsx**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Role } from '@hotel/shared';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import LoginPage from './pages/auth/LoginPage';

const ALL_STAFF = [Role.ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE, Role.FINANCE];
const ADMIN_RECEPTIONIST = [Role.ADMIN, Role.RECEPTIONIST];
const ADMIN_FINANCE = [Role.ADMIN, Role.FINANCE];
const TICKETS_ROLES = [Role.ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE];

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute allowedRoles={ALL_STAFF}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route
            path="dashboard"
            element={
              <ProtectedRoute allowedRoles={[Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE]}>
                <div className="text-amber-900 font-semibold">Dashboard — coming in Phase 5</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="apartments/*"
            element={
              <ProtectedRoute allowedRoles={ADMIN_RECEPTIONIST}>
                <div className="text-amber-900 font-semibold">Apartments — coming in Phase 2</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="tenants/*"
            element={
              <ProtectedRoute allowedRoles={ADMIN_RECEPTIONIST}>
                <div className="text-amber-900 font-semibold">Tenants — coming in Phase 2</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="payments/*"
            element={
              <ProtectedRoute allowedRoles={[Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE]}>
                <div className="text-amber-900 font-semibold">Payments — coming in Phase 3</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="tickets/*"
            element={
              <ProtectedRoute allowedRoles={TICKETS_ROLES}>
                <div className="text-amber-900 font-semibold">Tickets — coming in Phase 4</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="reports/*"
            element={
              <ProtectedRoute allowedRoles={ADMIN_FINANCE}>
                <div className="text-amber-900 font-semibold">Reports — coming in Phase 5</div>
              </ProtectedRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 4: Create client/src/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { queryClient } from './lib/queryClient';
import './i18n';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#fffbf5', color: '#78350f', border: '1px solid #fde68a' },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>
);
```

- [ ] **Step 5: Start both dev servers and verify login works end-to-end**

Terminal 1:
```bash
cd server && npm run dev
```

Terminal 2:
```bash
cd client && npm run dev
```

Open http://localhost:5173. Expected:
- `/` redirects to `/login`
- Login with admin credentials → redirects to `/dashboard`
- Language toggle switches EN ↔ AR and flips layout direction
- Sidebar shows correct icons for the logged-in user's role
- Logout clears session and redirects to `/login`

- [ ] **Step 6: Seed an admin user for manual testing**

Create `server/prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@hotel.com' },
    update: {},
    create: { name: 'Admin User', email: 'admin@hotel.com', password, role: 'ADMIN' },
  });
  console.log('Seeded admin@hotel.com / admin123');
}

main().finally(() => prisma.$disconnect());
```

Run it:
```bash
cd server && npx ts-node prisma/seed.ts
```

Expected: `Seeded admin@hotel.com / admin123`

- [ ] **Step 7: Run all server tests**

```bash
cd server && npm test
```

Expected: All tests pass (JWT: 2, password: 2, auth: 5 = 9 total)

- [ ] **Step 8: Final commit**

```bash
git add client/src/pages/ client/src/App.tsx client/src/main.tsx client/src/index.css server/prisma/seed.ts
git commit -m "feat: login page, app router, layout shell — Phase 1 complete"
```

---

## Summary

After Phase 1 you have:
- Full monorepo with shared types
- All Prisma models migrated
- JWT auth (login/logout/me) with httpOnly cookies, fully tested
- React app with Tailwind, i18n EN/AR, RTL toggle, Zustand UI store
- Top bar + collapsed icon sidebar (role-filtered)
- Protected routes with role-based redirects
- Login page with form validation

**Next:** `2026-05-12-phase-2-apartments-tenants.md`
