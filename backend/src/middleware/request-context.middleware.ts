import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Extended Request interface with audit context
 */
export interface RequestWithContext extends Request {
  requestId?: string;
  auditContext?: {
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
  };
}

/**
 * Middleware to add request context for audit logging
 * Adds requestId, IP address, and user agent to request object
 */
export const requestContext = (
  req: RequestWithContext,
  res: Response,
  next: NextFunction
): void => {
  // Generate unique request ID for correlation
  req.requestId = randomUUID();

  // Extract IP address (handle proxies/load balancers)
  const ipAddress =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    req.socket.remoteAddress ||
    'unknown';

  // Extract user agent
  const userAgent = req.get('user-agent') || 'unknown';

  // Attach audit context to request
  req.auditContext = {
    ipAddress,
    userAgent,
    requestId: req.requestId,
  };

  // Add request ID to response headers for client-side correlation
  res.setHeader('X-Request-Id', req.requestId);

  next();
};
