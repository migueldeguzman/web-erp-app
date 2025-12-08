import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './error.middleware';
import { UserRole, PrismaClient } from '@prisma/client';
import { RequestWithContext } from './request-context.middleware';

// Initialize Prisma client for database queries
const prisma = new PrismaClient();

export interface AuthRequest extends RequestWithContext {
  user?: {
    id: string;
    email: string;
    role: UserRole;
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401);
    }

    const token = authHeader.substring(7);
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }

    // Verify JWT signature and expiration
    let decoded: {
      id: string;
      email: string;
      role: UserRole;
    };

    try {
      decoded = jwt.verify(token, secret) as {
        id: string;
        email: string;
        role: UserRole;
      };
    } catch (jwtError: any) {
      if (jwtError.name === 'TokenExpiredError') {
        throw new AppError('Token has expired', 401);
      }
      if (jwtError.name === 'JsonWebTokenError') {
        throw new AppError('Invalid token', 401);
      }
      throw jwtError;
    }

    // Check if token is blacklisted
    const blacklistedToken = await prisma.tokenBlacklist.findUnique({
      where: { token },
    });

    if (blacklistedToken) {
      throw new AppError('Token has been revoked', 401);
    }

    // Check if user exists in either User table (staff) or Customer table (customers)
    let user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    // If not found in User table, check Customer table
    if (!user) {
      const customer = await prisma.customer.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
        },
      });

      if (!customer) {
        throw new AppError('User not found', 401);
      }

      // Map customer to user structure
      user = {
        id: customer.id,
        email: customer.email,
        role: customer.role,
        isActive: customer.isActive,
      };
    }

    if (!user.isActive) {
      // Add token to blacklist since user is deactivated
      await prisma.tokenBlacklist.create({
        data: {
          token,
          userId: user.id,
          reason: 'User deactivated',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Assuming 7 day expiry
        },
      }).catch(() => {}); // Don't fail auth if blacklisting fails

      throw new AppError('User account has been deactivated', 401);
    }

    // Use fresh user data from database instead of JWT claims
    // This ensures role changes take effect immediately
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const authorize = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Not authenticated', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action', 403)
      );
    }

    next();
  };
};

/**
 * Cleanup expired tokens from blacklist
 * Should be called periodically (e.g., via cron job)
 */
export const cleanupExpiredTokens = async (): Promise<number> => {
  try {
    const result = await prisma.tokenBlacklist.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
    return result.count;
  } catch (error) {
    console.error('Error cleaning up expired tokens:', error);
    return 0;
  }
};

// Schedule cleanup to run every hour (optional - can be called from a separate cron service)
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    cleanupExpiredTokens()
      .then(count => {
        if (count > 0) {
          console.log(`Cleaned up ${count} expired tokens from blacklist`);
        }
      })
      .catch(error => {
        console.error('Token cleanup failed:', error);
      });
  }, 60 * 60 * 1000); // Run every hour
}
