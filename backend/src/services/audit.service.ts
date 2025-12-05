import { PrismaClient, Prisma, AuditAction } from '@prisma/client';

export interface AuditContext {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  sessionId?: string;
}

export interface AuditLogInput {
  action: AuditAction;
  entity: string;
  entityId: string;
  oldValue?: any;
  newValue?: any;
}

export interface AuditFailureInput {
  action: AuditAction;
  entity: string;
  entityId: string;
  reason: string;
  errorDetails?: any;
}

/**
 * Centralized Audit Service
 * Provides standardized audit logging with sanitization and consistent formatting
 */
export class AuditService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Creates audit log within existing transaction
   * MUST be called within a Prisma transaction for atomicity
   */
  async log(
    tx: Prisma.TransactionClient,
    context: AuditContext,
    input: AuditLogInput
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        userId: context.userId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        oldValue: this.sanitize(input.oldValue),
        newValue: this.sanitize(input.newValue),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
  }

  /**
   * Logs failed operation (validation, business logic error)
   * MUST be called within a Prisma transaction for atomicity
   */
  async logFailure(
    tx: Prisma.TransactionClient,
    context: AuditContext,
    input: AuditFailureInput
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        userId: context.userId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId || 'operation_failed',
        newValue: {
          success: false,
          reason: input.reason,
          details: input.errorDetails,
          timestamp: new Date().toISOString(),
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
  }

  /**
   * Logs standalone event (not within transaction)
   * Use sparingly - prefer log() within transactions for atomicity
   */
  async logStandalone(
    context: AuditContext,
    input: AuditLogInput
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: context.userId,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId,
          oldValue: this.sanitize(input.oldValue),
          newValue: this.sanitize(input.newValue),
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    } catch (error) {
      // Log critical audit failure but don't crash the app
      console.error('CRITICAL: Audit log creation failed', {
        context,
        input,
        error: error instanceof Error ? error.message : error,
      });
      // TODO: Send alert to monitoring system (Sentry, CloudWatch, etc.)
      throw error; // Re-throw to maintain transaction rollback
    }
  }

  /**
   * Logs standalone failure event
   * Use sparingly - prefer logFailure() within transactions
   */
  async logFailureStandalone(
    context: AuditContext,
    input: AuditFailureInput
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: context.userId,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId || 'operation_failed',
          newValue: {
            success: false,
            reason: input.reason,
            details: input.errorDetails,
            timestamp: new Date().toISOString(),
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    } catch (error) {
      console.error('CRITICAL: Audit failure log creation failed', {
        context,
        input,
        error: error instanceof Error ? error.message : error,
      });
      // Don't re-throw for failure logs - we don't want to block the error response
    }
  }

  /**
   * Removes sensitive fields from audit data
   * Prevents passwords, tokens, secrets from being logged
   */
  private sanitize(data: any): any {
    if (!data || typeof data !== 'object') return data;

    const sensitive = ['password', 'token', 'secret', 'apikey', 'authorization'];
    const sanitized = Array.isArray(data) ? [...data] : { ...data };

    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase();
      if (sensitive.some((s) => lowerKey.includes(s))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitize(sanitized[key]);
      }
    }

    return sanitized;
  }

  /**
   * Calculates changes between old and new objects
   * Returns only changed fields to reduce audit log size
   */
  calculateChanges<T extends Record<string, any>>(
    oldObj: T,
    newObj: T
  ): {
    old: Partial<T>;
    new: Partial<T>;
    fields: string[];
    unchangedCount: number;
  } {
    const changes: any = { old: {}, new: {}, fields: [], unchangedCount: 0 };

    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

    for (const key of allKeys) {
      // Skip system fields
      if (['createdAt', 'updatedAt', 'id'].includes(key)) continue;

      if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
        changes.old[key] = oldObj[key];
        changes.new[key] = newObj[key];
        changes.fields.push(key);
      } else {
        changes.unchangedCount++;
      }
    }

    return changes;
  }
}
