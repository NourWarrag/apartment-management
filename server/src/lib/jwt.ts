import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET ?? 'dev-secret';
const expiresIn = process.env.JWT_EXPIRES_IN ?? '7d';

export interface TokenPayload {
  id: number;
  role: string;
  assignedBuildingId: number | null;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, secret) as jwt.JwtPayload;
}
