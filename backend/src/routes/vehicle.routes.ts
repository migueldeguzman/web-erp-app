import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  getAvailableVehicles,
  getVehicleById,
  checkVehicleAvailability,
  getAllVehicles,
} from '../controllers/vehicle.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/vehicles/available
 * Get all available vehicles for a company
 * Query params: companyId (required)
 */
router.get('/available', getAvailableVehicles);

/**
 * GET /api/vehicles/:id/availability
 * Check vehicle availability for a date range
 * Query params: startDate, endDate (both required)
 */
router.get('/:id/availability', checkVehicleAvailability);

/**
 * GET /api/vehicles/:id
 * Get vehicle by ID
 */
router.get('/:id', getVehicleById);

/**
 * GET /api/vehicles
 * Get all vehicles with optional filters
 * Query params: companyId (required), status, make, model
 */
router.get('/', getAllVehicles);

export default router;
