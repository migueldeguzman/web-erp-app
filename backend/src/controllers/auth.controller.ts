import { Request, Response, NextFunction } from 'express';
import { AppError, asyncHandler } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/database';
import { hashPassword, comparePassword } from '../utils/password.util';
import { generateToken } from '../utils/jwt.util';
import { AuditService } from '../services/audit.service';

const auditService = new AuditService(prisma);

export const register = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { email, password, firstName, lastName, role } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      // Log failed registration attempt (standalone - operation fails)
      await auditService.logFailureStandalone(
        {
          userId: '00000000-0000-0000-0000-000000000000',
          ipAddress: req.auditContext?.ipAddress,
          userAgent: req.auditContext?.userAgent,
          requestId: req.auditContext?.requestId,
        },
        {
          action: 'CREATE',
          entity: 'User',
          entityId: email,
          reason: 'user_already_exists',
          errorDetails: { email },
        }
      );

      throw new AppError('User with this email already exists', 400);
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user with audit log in transaction
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName,
          lastName,
          role: role || 'VIEWER',
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true,
        },
      });

      // Log successful registration within same transaction
      await auditService.log(
        tx,
        {
          userId: newUser.id,
          ipAddress: req.auditContext?.ipAddress,
          userAgent: req.auditContext?.userAgent,
          requestId: req.auditContext?.requestId,
        },
        {
          action: 'CREATE',
          entity: 'User',
          entityId: newUser.id,
          newValue: {
            email: newUser.email,
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            role: newUser.role,
          },
        }
      );

      return newUser;
    });

    // Generate token AFTER successful user creation and audit log
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.status(201).json({
      status: 'success',
      data: {
        user,
        token,
      },
    });
  }
);

export const login = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { email, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Dummy hash for timing attack prevention (valid bcrypt hash of "dummy_password_timing_attack")
    const dummyHash = '$2b$10$X6V2ILEXHZLZMxPFZGz4HuN4Hv2xyF/zJzXk2PnxYMvYjhT5B7tD6';

    // Always perform hash comparison to prevent timing attacks
    const isPasswordValid = user
      ? await comparePassword(password, user.password)
      : await comparePassword(password, dummyHash);

    // Check all conditions together
    if (!user || !isPasswordValid || !user.isActive) {
      // Log failed attempt - standalone (operation fails)
      await auditService.logFailureStandalone(
        {
          userId: user?.id || '00000000-0000-0000-0000-000000000000',
          ipAddress: req.auditContext?.ipAddress,
          userAgent: req.auditContext?.userAgent,
          requestId: req.auditContext?.requestId,
        },
        {
          action: 'LOGIN',
          entity: 'User',
          entityId: email,
          reason: !user ? 'user_not_found' : !isPasswordValid ? 'invalid_password' : 'user_inactive',
          errorDetails: { email },
        }
      );

      throw new AppError('Invalid credentials', 401);
    }

    // Log successful login and generate token atomically
    const { token, userResponse } = await prisma.$transaction(async (tx) => {
      // Log successful login FIRST within transaction
      await auditService.log(
        tx,
        {
          userId: user.id,
          ipAddress: req.auditContext?.ipAddress,
          userAgent: req.auditContext?.userAgent,
          requestId: req.auditContext?.requestId,
        },
        {
          action: 'LOGIN',
          entity: 'User',
          entityId: user.id,
          newValue: { success: true },
        }
      );

      // Generate token ONLY after audit log committed
      const generatedToken = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });

      return {
        token: generatedToken,
        userResponse: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      };
    });

    res.json({
      status: 'success',
      data: {
        user: userResponse,
        token,
      },
    });
  }
);

export const getMe = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({
      status: 'success',
      data: { user },
    });
  }
);

export const logout = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401);
    }
    const token = authHeader.substring(7);

    // Parse token to get expiry (we need this for blacklist cleanup)
    let expiresAt: Date;
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(token) as any;
      if (decoded && decoded.exp) {
        expiresAt = new Date(decoded.exp * 1000);
      } else {
        // Default to 7 days if we can't decode expiry
        expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      }
    } catch {
      // Default to 7 days if we can't decode token
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    // Blacklist token and log logout in transaction
    await prisma.$transaction(async (tx) => {
      // Add token to blacklist
      await tx.tokenBlacklist.create({
        data: {
          token,
          userId: req.user!.id,
          reason: 'User logout',
          expiresAt,
        },
      });

      // Log logout event within transaction
      await auditService.log(
        tx,
        {
          userId: req.user!.id,
          ipAddress: req.auditContext?.ipAddress,
          userAgent: req.auditContext?.userAgent,
          requestId: req.auditContext?.requestId,
        },
        {
          action: 'LOGOUT',
          entity: 'User',
          entityId: req.user!.id,
          newValue: {
            email: req.user!.email,
            tokenBlacklisted: true,
          },
        }
      );
    });

    res.json({
      status: 'success',
      message: 'Logged out successfully',
    });
  }
);
