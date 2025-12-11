import { Router } from 'express';
import rentalContractController from '../controllers/rental-contract.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/rental-contracts/approve-booking
 * @desc    Approve booking and create rental contract
 * @access  Private (MANAGER, ADMIN, ACCOUNTANT)
 */
router.post(
  '/approve-booking',
  authorize('MANAGER', 'ADMIN', 'ACCOUNTANT'),
  rentalContractController.approveBooking.bind(rentalContractController)
);

/**
 * @route   GET /api/rental-contracts
 * @desc    List rental contracts with filters
 * @access  Private
 */
router.get(
  '/',
  rentalContractController.list.bind(rentalContractController)
);

/**
 * @route   GET /api/rental-contracts/:id
 * @desc    Get rental contract by ID
 * @access  Private
 */
router.get(
  '/:id',
  rentalContractController.getById.bind(rentalContractController)
);

/**
 * @route   GET /api/rental-contracts/by-number/:companyId/:contractNumber
 * @desc    Get rental contract by contract number
 * @access  Private
 */
router.get(
  '/by-number/:companyId/:contractNumber',
  rentalContractController.getByContractNumber.bind(rentalContractController)
);

/**
 * @route   PATCH /api/rental-contracts/:id/status
 * @desc    Update contract status
 * @access  Private (MANAGER, ADMIN, ACCOUNTANT)
 */
router.patch(
  '/:id/status',
  authorize('MANAGER', 'ADMIN', 'ACCOUNTANT'),
  rentalContractController.updateStatus.bind(rentalContractController)
);

/**
 * @route   POST /api/rental-contracts/:id/pickup
 * @desc    Record vehicle pickup (OUT details)
 * @access  Private (MANAGER, ADMIN, ACCOUNTANT)
 */
router.post(
  '/:id/pickup',
  authorize('MANAGER', 'ADMIN', 'ACCOUNTANT'),
  rentalContractController.recordPickup.bind(rentalContractController)
);

/**
 * @route   POST /api/rental-contracts/:id/return
 * @desc    Record vehicle return (IN details)
 * @access  Private (MANAGER, ADMIN, ACCOUNTANT)
 */
router.post(
  '/:id/return',
  authorize('MANAGER', 'ADMIN', 'ACCOUNTANT'),
  rentalContractController.recordReturn.bind(rentalContractController)
);

/**
 * @route   POST /api/rental-contracts/:id/cancel
 * @desc    Cancel rental contract
 * @access  Private (MANAGER, ADMIN)
 */
router.post(
  '/:id/cancel',
  authorize('MANAGER', 'ADMIN'),
  rentalContractController.cancel.bind(rentalContractController)
);

export default router;
