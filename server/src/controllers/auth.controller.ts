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

export async function me(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  res.json(user);
}
