import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET', 'NODE_ENV'];
const missing = requiredEnvVars.filter(key => !process.env[key]);

if (missing.length > 0) {
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

// Import routes
import authRoutes from './routes/auth.routes';
import companyRoutes from './routes/company.routes';
import customerRoutes from './routes/customer.routes';
import accountRoutes from './routes/account.routes';
import invoiceRoutes from './routes/invoice.routes';
import paymentRoutes from './routes/payment.routes';
import transactionRoutes from './routes/transaction.routes';
import vehicleRoutes from './routes/vehicle.routes';
import bookingRoutes from './routes/booking.routes';

// Import middleware
import { errorHandler } from './middleware/error.middleware';
import { requestContext } from './middleware/request-context.middleware';

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Rate limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// General API rate limiter
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  maxAge: 86400, // 24 hours
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(morgan('dev'));

// Add request context for audit logging (must be after body parsers)
app.use(requestContext);

// Sanitize data against NoSQL injection
app.use(mongoSanitize());

// Simple XSS sanitization middleware (basic string sanitization)
const xssSanitize = (req: Request, res: Response, next: NextFunction) => {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  next();
};

function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    // Basic HTML/script tag removal for XSS protection
    return obj
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .trim();
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        // Also sanitize keys to prevent prototype pollution
        const sanitizedKey = typeof key === 'string' ? sanitizeObject(key) : key;
        sanitized[sanitizedKey] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }
  return obj;
}

// Apply XSS sanitization
app.use(xssSanitize);

// Import database health checker
import { isDatabaseConnected } from './config/database';

// Health check (no rate limiting on health endpoint)
app.get('/health', async (req: Request, res: Response) => {
  const healthy = await isDatabaseConnected();
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'OK' : 'UNHEALTHY',
    database: healthy ? 'connected' : 'disconnected',
    message: 'Vesla ERP API',
    timestamp: new Date().toISOString()
  });
});

// Apply general rate limiter to all API routes (except health check)
app.use('/api/', generalLimiter);

// API Routes (authLimiter is applied inside auth.routes.ts)
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/bookings', bookingRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️  Database: PostgreSQL`);
});
