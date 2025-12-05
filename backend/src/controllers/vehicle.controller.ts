import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { VehicleService } from '../services/vehicle.service';
import { AuthRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();
const vehicleService = new VehicleService(prisma);

/**
 * Get all available vehicles for a company
 */
export const getAvailableVehicles = async (req: AuthRequest, res: Response) => {
  try {
    const { companyId } = req.query;

    if (!companyId || typeof companyId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required',
      });
    }

    const vehicles = await vehicleService.getAvailableVehicles(companyId);

    res.json({
      success: true,
      data: vehicles,
    });
  } catch (error: any) {
    console.error('Error fetching available vehicles:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch available vehicles',
    });
  }
};

/**
 * Get vehicle by ID
 */
export const getVehicleById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const vehicle = await vehicleService.getVehicleById(id);

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found',
      });
    }

    res.json({
      success: true,
      data: vehicle,
    });
  } catch (error: any) {
    console.error('Error fetching vehicle:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch vehicle',
    });
  }
};

/**
 * Check vehicle availability for a period
 */
export const checkVehicleAvailability = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required',
      });
    }

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format',
      });
    }

    if (start >= end) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date',
      });
    }

    const isAvailable = await vehicleService.checkAvailability(id, start, end);

    res.json({
      success: true,
      data: {
        available: isAvailable,
      },
    });
  } catch (error: any) {
    console.error('Error checking vehicle availability:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to check vehicle availability',
    });
  }
};

/**
 * Get all vehicles (with filters)
 */
export const getAllVehicles = async (req: AuthRequest, res: Response) => {
  try {
    const { companyId, status, make, model } = req.query;

    if (!companyId || typeof companyId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required',
      });
    }

    const filters: any = {};
    if (status) filters.status = status;
    if (make) filters.make = make as string;
    if (model) filters.model = model as string;

    const vehicles = await vehicleService.getAllVehicles(companyId, filters);

    res.json({
      success: true,
      data: vehicles,
    });
  } catch (error: any) {
    console.error('Error fetching vehicles:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch vehicles',
    });
  }
};
