import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Rate limiter for authentication endpoints (stricter than general API limiter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation result checker middleware
const validateRequest = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      status: 'error',
      errors: errors.array()
    });
    return;
  }
  next();
};

// Validation middleware
const registerValidation = [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 12 })
    .withMessage('Password must be at least 12 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character'),
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
];

const loginValidation = [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required'),
];

// Routes
router.post('/register', authLimiter, registerValidation, validateRequest, authController.register);
router.post('/login', authLimiter, loginValidation, validateRequest, authController.login);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getMe);

export default router;
