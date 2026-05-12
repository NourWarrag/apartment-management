import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { comparePassword } from '../lib/password';
import { signToken } from '../lib/jwt';

const DUMMY_HASH = '$2a$10$dummy.hash.to.prevent.timing.attacks.xxxxxxxxxxxxxxxxx';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export async function login(req: AuthRequest, res: Response): Promise<void> {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ message: 'Email and password are required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Always run comparePassword to prevent timing attacks
  const passwordMatch = await comparePassword(password, user?.password ?? DUMMY_HASH);

  if (!user || !passwordMatch) {
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
