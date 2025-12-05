import { body, param, query, validationResult, ValidationChain } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { Decimal } from '@prisma/client/runtime/library';

// Middleware to handle validation errors
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Custom validators
export const isValidUUID = (value: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
};

export const isValidDecimalPrecision = (value: any, maxDigits: number = 15, maxDecimals: number = 2): boolean => {
  try {
    const num = new Decimal(value);
    const str = num.toString();
    const parts = str.split('.');

    // Check total digits (excluding decimal point and negative sign)
    const totalDigits = str.replace(/[.-]/g, '').length;
    if (totalDigits > maxDigits) return false;

    // Check decimal places
    if (parts.length > 1 && parts[1].length > maxDecimals) return false;

    return true;
  } catch {
    return false;
  }
};

// Transaction validation chains
export const validateCreateTransaction = (): ValidationChain[] => [
  body('companyId')
    .notEmpty().withMessage('Company ID is required')
    .custom(isValidUUID).withMessage('Invalid company ID format'),
  body('type')
    .notEmpty().withMessage('Transaction type is required')
    .isIn(['JOURNAL_VOUCHER', 'INVOICE', 'PAYMENT', 'RECEIPT', 'CONTRA', 'ADJUSTMENT'])
    .withMessage('Invalid transaction type'),
  body('date')
    .notEmpty().withMessage('Date is required')
    .isISO8601().withMessage('Invalid date format'),
  body('description')
    .optional()
    .isString().withMessage('Description must be a string')
    .isLength({ max: 500 }).withMessage('Description too long'),
  body('reference')
    .optional()
    .isString().withMessage('Reference must be a string')
    .isLength({ max: 100 }).withMessage('Reference too long'),
  body('lines')
    .isArray({ min: 2 }).withMessage('Transaction must have at least 2 lines'),
  body('lines.*.accountId')
    .notEmpty().withMessage('Account ID is required')
    .custom(isValidUUID).withMessage('Invalid account ID format'),
  body('lines.*.debit')
    .isNumeric().withMessage('Debit must be numeric')
    .custom(value => parseFloat(value) >= 0).withMessage('Debit cannot be negative')
    .custom(value => isValidDecimalPrecision(value)).withMessage('Debit exceeds precision limits'),
  body('lines.*.credit')
    .isNumeric().withMessage('Credit must be numeric')
    .custom(value => parseFloat(value) >= 0).withMessage('Credit cannot be negative')
    .custom(value => isValidDecimalPrecision(value)).withMessage('Credit exceeds precision limits'),
  body('lines.*.description')
    .optional()
    .isString().withMessage('Line description must be a string')
    .isLength({ max: 200 }).withMessage('Line description too long'),
  // Validate that transaction balances
  body('lines')
    .custom((lines: any[]) => {
      const totalDebit = lines.reduce((sum, line) => sum + parseFloat(line.debit || 0), 0);
      const totalCredit = lines.reduce((sum, line) => sum + parseFloat(line.credit || 0), 0);
      return Math.abs(totalDebit - totalCredit) < 0.01; // Allow for small rounding differences
    }).withMessage('Transaction does not balance - total debits must equal total credits')
];

// Invoice validation chains
export const validateCreateInvoice = (): ValidationChain[] => [
  body('companyId')
    .notEmpty().withMessage('Company ID is required')
    .custom(isValidUUID).withMessage('Invalid company ID format'),
  body('customerId')
    .notEmpty().withMessage('Customer ID is required')
    .custom(isValidUUID).withMessage('Invalid customer ID format'),
  body('invoiceDate')
    .notEmpty().withMessage('Invoice date is required')
    .isISO8601().withMessage('Invalid date format'),
  body('dueDate')
    .notEmpty().withMessage('Due date is required')
    .isISO8601().withMessage('Invalid date format')
    .custom((value, { req }) => {
      return new Date(value) >= new Date(req.body.invoiceDate);
    }).withMessage('Due date cannot be before invoice date'),
  body('items')
    .isArray({ min: 1 }).withMessage('Invoice must have at least one item'),
  body('items.*.description')
    .notEmpty().withMessage('Item description is required')
    .isString().withMessage('Item description must be a string')
    .isLength({ max: 200 }).withMessage('Item description too long'),
  body('items.*.quantity')
    .isNumeric().withMessage('Quantity must be numeric')
    .custom(value => parseFloat(value) > 0).withMessage('Quantity must be positive')
    .custom(value => isValidDecimalPrecision(value)).withMessage('Quantity exceeds precision limits'),
  body('items.*.unitPrice')
    .isNumeric().withMessage('Unit price must be numeric')
    .custom(value => parseFloat(value) >= 0).withMessage('Unit price cannot be negative')
    .custom(value => isValidDecimalPrecision(value)).withMessage('Unit price exceeds precision limits'),
  body('notes')
    .optional()
    .isString().withMessage('Notes must be a string')
    .isLength({ max: 1000 }).withMessage('Notes too long')
];

// Payment validation chains
export const validateCreatePayment = (): ValidationChain[] => [
  body('companyId')
    .notEmpty().withMessage('Company ID is required')
    .custom(isValidUUID).withMessage('Invalid company ID format'),
  body('customerId')
    .optional()
    .custom(isValidUUID).withMessage('Invalid customer ID format'),
  body('invoiceId')
    .optional()
    .custom(isValidUUID).withMessage('Invalid invoice ID format'),
  body('paymentDate')
    .notEmpty().withMessage('Payment date is required')
    .isISO8601().withMessage('Invalid date format'),
  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isNumeric().withMessage('Amount must be numeric')
    .custom(value => parseFloat(value) > 0).withMessage('Amount must be positive')
    .custom(value => isValidDecimalPrecision(value)).withMessage('Amount exceeds precision limits'),
  body('method')
    .notEmpty().withMessage('Payment method is required')
    .isIn(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT_CARD', 'OTHER'])
    .withMessage('Invalid payment method'),
  body('reference')
    .optional()
    .isString().withMessage('Reference must be a string')
    .isLength({ max: 100 }).withMessage('Reference too long'),
  body('notes')
    .optional()
    .isString().withMessage('Notes must be a string')
    .isLength({ max: 500 }).withMessage('Notes too long')
];

// ID parameter validation
export const validateIdParam = (): ValidationChain[] => [
  param('id')
    .notEmpty().withMessage('ID is required')
    .custom(isValidUUID).withMessage('Invalid ID format')
];

// Company ID validation for queries
export const validateCompanyId = (): ValidationChain[] => [
  query('companyId')
    .notEmpty().withMessage('Company ID is required')
    .custom(isValidUUID).withMessage('Invalid company ID format')
];

// Pagination validation
export const validatePagination = (): ValidationChain[] => [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

// Date range validation
export const validateDateRange = (): ValidationChain[] => [
  query('startDate')
    .optional()
    .isISO8601().withMessage('Invalid start date format'),
  query('endDate')
    .optional()
    .isISO8601().withMessage('Invalid end date format')
    .custom((value, { req }) => {
      if (req.query.startDate) {
        return new Date(value) >= new Date(req.query.startDate);
      }
      return true;
    }).withMessage('End date cannot be before start date')
];

// Status validation for updates
export const validateTransactionStatus = (): ValidationChain[] => [
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(['DRAFT', 'POSTED', 'VOID'])
    .withMessage('Invalid transaction status')
];

export const validateInvoiceStatus = (): ValidationChain[] => [
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'])
    .withMessage('Invalid invoice status')
];

export const validatePaymentStatus = (): ValidationChain[] => [
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(['DRAFT', 'POSTED', 'RECONCILED', 'VOID'])
    .withMessage('Invalid payment status')
];

// Auth validation
export const validateLogin = (): ValidationChain[] => [
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
];

export const validateRegister = (): ValidationChain[] => [
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character'),
  body('firstName')
    .notEmpty().withMessage('First name is required')
    .isString().withMessage('First name must be a string')
    .isLength({ min: 2, max: 50 }).withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .notEmpty().withMessage('Last name is required')
    .isString().withMessage('Last name must be a string')
    .isLength({ min: 2, max: 50 }).withMessage('Last name must be between 2 and 50 characters'),
  body('role')
    .optional()
    .isIn(['ADMIN', 'ACCOUNTANT', 'MANAGER', 'VIEWER'])
    .withMessage('Invalid role')
];

// Export all validators
export default {
  handleValidationErrors,
  validateCreateTransaction,
  validateCreateInvoice,
  validateCreatePayment,
  validateIdParam,
  validateCompanyId,
  validatePagination,
  validateDateRange,
  validateTransactionStatus,
  validateInvoiceStatus,
  validatePaymentStatus,
  validateLogin,
  validateRegister,
  isValidDecimalPrecision
};