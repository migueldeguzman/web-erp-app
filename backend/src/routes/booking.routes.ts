import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  createBooking,
  confirmBooking,
  getBookingById,
  listBookings,
} from '../controllers/booking.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/bookings
 * Create a new booking
 * Body: { companyId, vehicleId, customerId, startDate, endDate, notes? }
 */
router.post('/', createBooking);

/**
 * POST /api/bookings/:id/confirm
 * Confirm booking and generate invoice
 * Body: { receivableAccountId, revenueAccountId }
 */
router.post('/:id/confirm', confirmBooking);

/**
 * GET /api/bookings/:id
 * Get booking by ID
 */
router.get('/:id', getBookingById);

/**
 * GET /api/bookings
 * List bookings with filters
 * Query params: companyId (required), customerId?, vehicleId?, status?, page?, limit?
 */
router.get('/', listBookings);

export default router;
