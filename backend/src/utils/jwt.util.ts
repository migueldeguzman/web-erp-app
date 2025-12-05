import jwt, { SignOptions } from 'jsonwebtoken';
import { UserRole } from '@prisma/client';

export interface JWTPayload {
  id: string;
  email: string;
  role: UserRole;
}

export const generateToken = (payload: JWTPayload): string => {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  if (!secret) {
    throw new Error('JWT_SECRET is not defined');
  }

  const signOptions: SignOptions = {
    expiresIn: expiresIn as SignOptions['expiresIn'],
  };

  return jwt.sign(
    {
      ...payload,
      iat: Math.floor(Date.now() / 1000),
    },
    secret,
    signOptions
  );
};

export const verifyToken = (token: string): JWTPayload => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is not defined');
  }

  return jwt.verify(token, secret) as JWTPayload;
};
